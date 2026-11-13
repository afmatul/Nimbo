import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import { evaluatePassword, LEGAL_DOCUMENTS } from '@nimbo/contracts';

import { I_OBJECT_STORAGE } from '../modules/storage';
import type { IObjectStorage } from '../modules/storage';
import { createActor, I_PASSWORD_HASHER, I_TRANSACTION_RUNNER, Role } from '../shared';
import type { Actor, IPasswordHasher, ITransactionRunner } from '../shared';

import { contentOf, kindOf } from './demo-content';
import { demoEmail } from './demo-corpus';
import type {
  AccountKey,
  DemoAccount,
  DemoCorpus,
  DemoFile,
  DemoLink,
  DemoShare,
  DemoSubscription,
  FolderPathNames,
} from './demo-corpus';
import { SeedStore } from './seed-store';
import type { FolderRef } from './seed-store';

/** Corpus y contraseña de la corrida; los arma `seed.ts` con el entorno validado. */
export interface SeedInput {
  readonly corpus: DemoCorpus;
  readonly password: string;
}

export const SEED_INPUT = Symbol('SEED_INPUT');

/** Cuántas filas creó la corrida, por tipo: cero en todo cuando ya estaba sembrado. Sin ids ni nombres. */
export interface SeedReport {
  plans: number;
  accounts: number;
  subscriptions: number;
  folders: number;
  files: number;
  shares: number;
  links: number;
}

/** La semilla se niega antes de escribir nada; el mensaje nunca repite la contraseña. */
export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefusedError';
  }
}

/** Clave `u/{propietario}/{archivo}/{versión}` de `ObjectKey` (storage): el adaptador rechaza cualquier otra. */
const objectKeyOf = (ownerId: string, fileId: string, versionId: string): string =>
  `u/${ownerId}/${fileId}/${versionId}`;

/** Un token que nadie conoce: el enlace existe para la demo del dueño, que puede revocarlo o crear otro. */
const unknownTokenHash = (): string =>
  createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex');

/**
 * Siembra el corpus de demostración (cuentas, suscripciones, árbol, comparticiones y enlaces) de forma idempotente.
 * Respeta las invariantes del dominio: contraseña validada con la política de 001 y guardada con Argon2id
 * (`IPasswordHasher`), tamaños en `bigint`, objetos reales en MinIO con el mismo adaptador que `storage`, espacio usado
 * sumado en la misma transacción que el archivo y filas de cliente escritas como su dueño (RLS).
 */
@Injectable()
export class DemoSeeder {
  private readonly folderCache = new Map<string, FolderRef>();

  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(SeedStore) private readonly store: SeedStore,
    @Inject(SEED_INPUT) private readonly input: SeedInput,
  ) {}

  async seed(): Promise<SeedReport> {
    const { corpus } = this.input;
    this.assertPasswordPolicy(corpus.accounts);
    const report: SeedReport = {
      plans: 0,
      accounts: 0,
      subscriptions: 0,
      folders: 0,
      files: 0,
      shares: 0,
      links: 0,
    };
    report.plans = await this.seedPlans(corpus);
    const actors = await this.seedAccounts(corpus.accounts, report);
    const of = (key: AccountKey): Actor => actors.get(key) as Actor;
    for (const wanted of corpus.subscriptions)
      report.subscriptions += await this.seedSubscription(of(wanted.account), wanted);
    for (const { owner, path } of corpus.folders) await this.folderAt(of(owner), path, report);
    for (const file of corpus.files)
      report.files += await this.seedFile(of(file.owner), file, report);
    for (const share of corpus.shares) report.shares += await this.seedShare(share, of);
    for (const link of corpus.links) report.links += await this.seedLink(of(link.owner), link);
    return report;
  }

  private assertPasswordPolicy(accounts: readonly DemoAccount[]): void {
    const weak = accounts.some((account) =>
      evaluatePassword(this.input.password, demoEmail(account.key)).some((rule) => !rule.passed),
    );
    if (weak) {
      throw new SeedRefusedError(
        'SEED_DEMO_PASSWORD no cumple la política de contraseñas (12+ caracteres, no común y sin el correo): cámbiala.',
      );
    }
  }

  private async seedPlans(corpus: DemoCorpus): Promise<number> {
    return this.transactions.run(async () => {
      const missing = await this.store.missingPlans(corpus.catalogPlanSlugs);
      if (missing.length > 0) {
        throw new SeedRefusedError(
          'Faltan planes del catálogo: corre las migraciones antes de sembrar.',
        );
      }
      let created = 0;
      for (const plan of corpus.demoPlans) {
        if (await this.store.insertPlanIfMissing(plan)) created += 1;
      }
      return created;
    });
  }

  private async seedAccounts(
    accounts: readonly DemoAccount[],
    report: SeedReport,
  ): Promise<Map<AccountKey, Actor>> {
    const actors = new Map<AccountKey, Actor>();
    for (const account of accounts) {
      const { id, created } = await this.ensureAccount(account);
      if (created) report.accounts += 1;
      actors.set(account.key, createActor(id, account.role));
    }
    return actors;
  }

  /** Solo hashea si la cuenta no existe: una contraseña cambiada por la persona no se pisa. */
  private async ensureAccount(account: DemoAccount): Promise<{ id: string; created: boolean }> {
    const email = demoEmail(account.key);
    const existing = await this.transactions.run(() => this.store.userId(email));
    if (existing !== null) return { id: existing, created: false };
    const passwordHash = (await this.hasher.hash(this.input.password)).reveal();
    const isClient = account.role === Role.CLIENT;
    const inserted = await this.transactions.run(() =>
      this.store.insertUser({
        ...account,
        email,
        passwordHash,
        termsVersion: isClient ? LEGAL_DOCUMENTS.terms.version : null,
        privacyVersion: isClient ? LEGAL_DOCUMENTS.privacy.version : null,
      }),
    );
    // `null`: otra corrida la creó entre la lectura y la inserción; se toma la suya.
    return inserted === null
      ? {
          id: (await this.transactions.run(() => this.store.userId(email))) as string,
          created: false,
        }
      : { id: inserted, created: true };
  }

  private async seedSubscription(owner: Actor, wanted: DemoSubscription): Promise<number> {
    const plans = await this.transactions.run(async () => ({
      planId: await this.store.planId(wanted.planSlug),
      pendingPlanId:
        wanted.pendingPlanSlug === null ? null : await this.store.planId(wanted.pendingPlanSlug),
    }));
    const created = await this.transactions.withActor(owner, () =>
      this.store.insertSubscription(owner, plans, wanted),
    );
    return created ? 1 : 0;
  }

  /** Busca o crea cada carpeta de la ruta (la raíz es `null`). */
  private async folderAt(
    owner: Actor,
    path: FolderPathNames,
    report: SeedReport,
  ): Promise<FolderRef | null> {
    let parent: FolderRef | null = null;
    for (const [index, name] of path.entries()) {
      const cacheKey = `${owner.id}:${path.slice(0, index + 1).join('/')}`;
      const cached = this.folderCache.get(cacheKey);
      parent = cached ?? (await this.ensureFolder(owner, parent, name, report));
      this.folderCache.set(cacheKey, parent);
    }
    return parent;
  }

  private ensureFolder(
    owner: Actor,
    parent: FolderRef | null,
    name: string,
    report: SeedReport,
  ): Promise<FolderRef> {
    return this.transactions.withActor(owner, async () => {
      const existing = await this.store.childFolder(owner, parent?.id ?? null, name);
      if (existing !== null) return existing;
      const id = randomUUID();
      const folder = { id, path: `${parent?.path ?? '/'}${id}/`, depth: (parent?.depth ?? 0) + 1 };
      await this.store.insertFolder(owner, parent?.id ?? null, { ...folder, name });
      report.folders += 1;
      return folder;
    });
  }

  /** Filas y objeto en la misma transacción: si MinIO falla, no queda un archivo sin contenido. */
  private async seedFile(owner: Actor, file: DemoFile, report: SeedReport): Promise<number> {
    const folder = await this.folderAt(owner, file.folder, report);
    const folderId = folder?.id ?? null;
    return this.transactions.withActor(owner, async () => {
      if ((await this.store.fileId(owner, folderId, file.name)) !== null) return 0;
      const content = contentOf(file);
      const [id, versionId] = [randomUUID(), randomUUID()];
      const objectKey = objectKeyOf(owner.id, id, versionId);
      const sizeBytes = BigInt(content.length);
      await this.store.insertFile(owner, {
        id,
        versionId,
        folderId,
        name: file.name,
        kind: kindOf(file.name),
        sizeBytes,
        objectKey,
      });
      await this.objects.putObjectStream(objectKey, Readable.from([content]), sizeBytes);
      return 1;
    });
  }

  private async seedShare(share: DemoShare, of: (key: AccountKey) => Actor): Promise<number> {
    const owner = of(share.owner);
    const node = await this.nodeOf(owner, share);
    const created = await this.transactions.withActor(owner, () =>
      this.store.insertShare(owner, {
        recipientId: of(share.recipient).id,
        level: share.level,
        ...node,
      }),
    );
    return created ? 1 : 0;
  }

  private async nodeOf(
    owner: Actor,
    { target }: DemoShare,
  ): Promise<{ fileId: string | null; folderId: string | null }> {
    if (target.kind === 'carpeta') {
      return { fileId: null, folderId: this.requireFolder(owner, target.folder).id };
    }
    return { fileId: await this.requireFile(owner, target.folder, target.name), folderId: null };
  }

  private async seedLink(owner: Actor, link: DemoLink): Promise<number> {
    const fileId = await this.requireFile(owner, link.folder, link.name);
    return this.transactions.withActor(owner, async () => {
      if (await this.store.hasLink(owner, fileId, link.expired)) return 0;
      await this.store.insertLink(owner, {
        fileId,
        tokenHash: unknownTokenHash(),
        expired: link.expired,
      });
      return 1;
    });
  }

  private requireFolder(owner: Actor, path: FolderPathNames): FolderRef {
    const folder = this.folderCache.get(`${owner.id}:${path.join('/')}`);
    if (folder === undefined) throw new Error('El corpus comparte una carpeta que no siembra.');
    return folder;
  }

  private async requireFile(owner: Actor, folder: FolderPathNames, name: string): Promise<string> {
    const folderId = folder.length === 0 ? null : this.requireFolder(owner, folder).id;
    const id = await this.transactions.withActor(owner, () =>
      this.store.fileId(owner, folderId, name),
    );
    if (id === null) throw new Error('El corpus comparte un archivo que no siembra.');
    return id;
  }
}
