import { randomUUID } from 'node:crypto';

import { LEGAL_DOCUMENTS } from '@nimbo/contracts';
import type { DataSource, EntityManager } from 'typeorm';

import { FOLDER_CONFIG } from '../../../src/modules/storage/application/folder-config';
import type { FolderConfig } from '../../../src/modules/storage/application/folder-config';
import { I_NODE_REPOSITORY } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import type { INodeRepository } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import { I_QUICK_ACCESS_REPOSITORY } from '../../../src/modules/storage/application/ports/i-quick-access.repository.port';
import type {
  IQuickAccessRepository,
  QuickAccessNodeRef,
} from '../../../src/modules/storage/application/ports/i-quick-access.repository.port';
import { I_QUOTA_REPOSITORY } from '../../../src/modules/storage/application/ports/i-quota.repository.port';
import type { IQuotaRepository } from '../../../src/modules/storage/application/ports/i-quota.repository.port';
import { I_TRASH_REPOSITORY } from '../../../src/modules/storage/application/ports/i-trash.repository.port';
import type { ITrashRepository } from '../../../src/modules/storage/application/ports/i-trash.repository.port';
import { I_UPLOAD_SESSION_REPOSITORY } from '../../../src/modules/storage/application/ports/i-upload-session.repository.port';
import type { IUploadSessionRepository } from '../../../src/modules/storage/application/ports/i-upload-session.repository.port';
import { File } from '../../../src/modules/storage/domain/file';
import { FileName } from '../../../src/modules/storage/domain/file-name.vo';
import { FileVersion } from '../../../src/modules/storage/domain/file-version';
import { Folder } from '../../../src/modules/storage/domain/folder';
import { FolderName } from '../../../src/modules/storage/domain/folder-name.vo';
import { ObjectKey } from '../../../src/modules/storage/domain/object-key';
import { TrashState } from '../../../src/modules/storage/domain/trash-state';
import { UploadSession } from '../../../src/modules/storage/domain/upload-session';
import { createActor, FixedClock, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { Actor, ITransactionRunner } from '../../../src/shared';
import { createTestApp } from '../../int/setup/test-app';
import type { TestApp, TestAppOptions } from '../../int/setup/test-app';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';

/** Nombre visible por defecto; los dos clientes del mundo lo comparten (plan 003 §6.7). */
const DEFAULT_NAME = 'Ana López';
/** Misma fecha de alta y de aceptación para todas las cuentas: nada las distingue salvo `id` y correo. */
const WORLD_CREATED_AT = new Date('2026-09-01T09:00:00.000Z');
/** PHC de relleno: nadie inicia sesión con estas cuentas; `tokenFor` emite sus tokens. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVuaXNv$aXNvbGF0aW9u';

export type InternalRole = Exclude<Role, Role.CLIENT>;

export interface WorldAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

/** *Builder* de cuentas del mundo (`conventions.md`): `aClient().named('Ana López').build()`. */
export class AccountBuilder {
  private name = DEFAULT_NAME;
  private email: string | undefined;

  constructor(private readonly role: Role) {}

  named(name: string): this {
    this.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  build(): WorldAccount {
    const id = randomUUID();
    return Object.freeze({
      id,
      name: this.name,
      email: this.email ?? `${this.role.toLowerCase()}.${id}@ejemplo.com`,
      role: this.role,
    });
  }
}

export const aClient = (): AccountBuilder => new AccountBuilder(Role.CLIENT);

export const anInternal = (role: InternalRole): AccountBuilder => new AccountBuilder(role);

/** Tamaño de los archivos y cargas del mundo: igual para las dos cuentas (nada los distingue salvo el `id`). */
const WORLD_FILE_BYTES = 4096n;

/** Archivo `.txt` del mundo: solo la fila (`archivo` + `version_archivo`); no hay objeto en MinIO. */
export interface WorldFile {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
}

/** Carpeta del mundo en la raíz del cliente: solo la fila `carpeta`. */
export interface WorldFolder {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
}

/** Nombres de lo que `withTrash` crea y manda a la papelera, cada uno por sí mismo (raíces de la papelera). */
export interface WorldTrashRequest {
  readonly files?: readonly string[];
  readonly folders?: readonly string[];
}

/** Raíces de la papelera del cliente que dejó `withTrash`. */
export interface WorldTrash {
  readonly files: readonly WorldFile[];
  readonly folders: readonly WorldFolder[];
}

/** Retención con que `withTrash` fija `purgar_en`: nada del mundo vence durante la suite. */
const WORLD_TRASH_RETENTION_DAYS = 30;

/** Carga simple `activa` del mundo: solo la fila `carga` (la reserva); no hay objeto en MinIO. */
export interface WorldUpload {
  readonly id: string;
  readonly ownerId: string;
}

/** Nodo del cliente que `withQuickAccess` fija o abre (por tipo e id). */
export type WorldNodeRef = QuickAccessNodeRef;

/** Lo que `withQuickAccess` marca, en orden: el último de cada lista es el más nuevo. */
export interface WorldQuickAccessRequest {
  readonly pinned?: readonly WorldNodeRef[];
  readonly opened?: readonly WorldNodeRef[];
}

export interface IsolationWorld {
  /** Dos clientes casi idénticos: mismo nombre, estado y fechas; correos que difieren en un carácter. */
  readonly clients: readonly [WorldAccount, WorldAccount];
  readonly internals: Readonly<Record<InternalRole, WorldAccount>>;
  /** Token de acceso de prueba de la cuenta (002-PR-2 lo cambia por uno real). */
  tokenFor(account: WorldAccount): string;
  /** App de Nest conectada como `nimbo_app`, nunca como el dueño (`DatabaseRoleCheck` lo impide). */
  appAs(options?: Omit<TestAppOptions, 'env'>): Promise<TestApp>;
  /**
   * Archivos del cliente con esos nombres, insertados **como `nimbo_app` dentro de `withActor`** con los
   * repositorios de `storage` de `app` (que debe montar `StorageModule`): RLS los valida al escribir (005 T-45).
   */
  withFiles(app: TestApp, owner: WorldAccount, names: readonly string[]): Promise<WorldFile[]>;
  /** Cargas simples activas del cliente, insertadas como `withFiles` (005 T-45). */
  withUploads(app: TestApp, owner: WorldAccount, count: number): Promise<WorldUpload[]>;
  /** Carpetas vacías en la raíz del cliente con esos nombres, insertadas como `withFiles` (006 T-07). */
  withFolders(app: TestApp, owner: WorldAccount, names: readonly string[]): Promise<WorldFolder[]>;
  /**
   * Archivos y carpetas del cliente creados y mandados a la papelera con los repositorios de `storage`, como
   * `withFiles` (006 T-07): quedan como raíces de la papelera, sin vencer.
   */
  withTrash(app: TestApp, owner: WorldAccount, request: WorldTrashRequest): Promise<WorldTrash>;
  /**
   * Fijados y aperturas del cliente sobre nodos suyos, escritos con `IQuickAccessRepository` como `withFiles` (006
   * T-15): RLS de `acceso_rapido` los valida al escribir. Cada marca es 1 ms posterior a la anterior; sin poda.
   */
  withQuickAccess(
    app: TestApp,
    owner: WorldAccount,
    request: WorldQuickAccessRequest,
  ): Promise<void>;
  /** Borra las cuentas del mundo (como el dueño) y cierra su conexión. */
  close(): Promise<void>;
}

const insertAccount = async (owner: EntityManager, account: WorldAccount): Promise<void> => {
  const isClient = account.role === Role.CLIENT;
  await owner.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                          version_privacidad, terminos_aceptados_en, creado_en)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9)`,
    [
      account.id,
      account.name,
      account.email,
      PLACEHOLDER_PHC,
      account.role,
      isClient ? LEGAL_DOCUMENTS.terms.version : null,
      isClient ? LEGAL_DOCUMENTS.privacy.version : null,
      isClient ? WORLD_CREATED_AT : null,
      WORLD_CREATED_AT,
    ],
  );
};

/**
 * Inserta todas las cuentas en una transacción: si una falla, no queda ninguna. En ese caso cierra la conexión del
 * dueño y relanza el error original.
 */
const insertAll = async (owner: DataSource, accounts: readonly WorldAccount[]): Promise<void> => {
  try {
    await owner.transaction(async (manager) => {
      for (const account of accounts) {
        await insertAccount(manager, account);
      }
    });
  } catch (error: unknown) {
    await owner.destroy().catch(() => undefined);
    throw error;
  }
};

/** Correos de igual longitud que difieren en un solo carácter (`z`/`s`), únicos por mundo. */
const nearlyIdenticalEmails = (): readonly [string, string] => {
  const tag = randomUUID();
  return [`ana.lopez.${tag}@ejemplo.com`, `ana.lopes.${tag}@ejemplo.com`];
};

/** Lo que `withFiles`/`withUploads` toman de una app con `StorageModule`: escriben como `nimbo_app`. */
const storageWritersOf = (testApp: TestApp) => {
  const get = <T>(token: symbol | string): T =>
    testApp.app.get<unknown, T>(token, { strict: false });
  return {
    transactions: get<ITransactionRunner>(I_TRANSACTION_RUNNER),
    nodes: get<INodeRepository>(I_NODE_REPOSITORY),
    quotas: get<IQuotaRepository>(I_QUOTA_REPOSITORY),
    sessions: get<IUploadSessionRepository>(I_UPLOAD_SESSION_REPOSITORY),
    trash: get<ITrashRepository>(I_TRASH_REPOSITORY),
    quickAccess: get<IQuickAccessRepository>(I_QUICK_ACCESS_REPOSITORY),
    folderConfig: get<FolderConfig>(FOLDER_CONFIG),
  };
};

const clientActor = (account: WorldAccount): Actor => {
  if (account.role !== Role.CLIENT) throw new Error('Solo un cliente tiene archivos y cargas');
  return createActor(account.id, Role.CLIENT);
};

type StorageWriters = ReturnType<typeof storageWritersOf>;

/** Inserta un archivo vivo en la raíz; corre dentro del `withActor` de quien llama. */
const insertFileAs = async (
  { nodes, quotas }: StorageWriters,
  actor: Actor,
  name: string,
): Promise<WorldFile> => {
  const now = new Date();
  const ids = { fileId: randomUUID(), versionId: randomUUID() };
  const file = File.create({
    id: ids.fileId,
    ownerId: actor.id,
    folderId: null,
    name: FileName.of(name),
    kind: 'texto',
    sizeBytes: WORLD_FILE_BYTES,
    currentVersionId: ids.versionId,
    now,
  });
  const version = FileVersion.fromUpload({
    id: ids.versionId,
    fileId: ids.fileId,
    objectKey: ObjectKey.of(actor.id, ids.fileId, ids.versionId),
    sizeBytes: WORLD_FILE_BYTES,
    createdBy: actor.id,
    now,
  });
  await nodes.insertWithVersion(actor, file, version);
  await quotas.addUsedBytes(actor, WORLD_FILE_BYTES);
  return { id: file.id, ownerId: actor.id, name: file.name.value };
};

/** Inserta una carpeta vacía en la raíz; corre dentro del `withActor` de quien llama. */
const insertFolderAs = async (
  { nodes, folderConfig }: StorageWriters,
  actor: Actor,
  name: string,
): Promise<Folder> => {
  const folder = Folder.create({
    id: randomUUID(),
    ownerId: actor.id,
    name: FolderName.of(name),
    parent: null,
    maxDepth: folderConfig.maxDepth,
    now: new Date(),
  });
  await nodes.insertFolder(actor, folder);
  return folder;
};

const worldFolderOf = (folder: Folder): WorldFolder => ({
  id: folder.id,
  ownerId: folder.ownerId,
  name: folder.name.value,
});

/** Corre `insert` por cada nombre, en orden, y junta los resultados. */
const insertEach = async <T>(
  names: readonly string[],
  insert: (name: string) => Promise<T>,
): Promise<T[]> => {
  const inserted: T[] = [];
  for (const name of names) inserted.push(await insert(name));
  return inserted;
};

const insertFiles = async (
  testApp: TestApp,
  owner: WorldAccount,
  names: readonly string[],
): Promise<WorldFile[]> => {
  const writers = storageWritersOf(testApp);
  const actor = clientActor(owner);
  return writers.transactions.withActor(actor, () =>
    insertEach(names, (name) => insertFileAs(writers, actor, name)),
  );
};

const insertFolders = async (
  testApp: TestApp,
  owner: WorldAccount,
  names: readonly string[],
): Promise<WorldFolder[]> => {
  const writers = storageWritersOf(testApp);
  const actor = clientActor(owner);
  return writers.transactions.withActor(actor, () =>
    insertEach(names, async (name) => worldFolderOf(await insertFolderAs(writers, actor, name))),
  );
};

const insertTrash = async (
  testApp: TestApp,
  owner: WorldAccount,
  request: WorldTrashRequest,
): Promise<WorldTrash> => {
  const writers = storageWritersOf(testApp);
  const actor = clientActor(owner);
  const startTrash = (): TrashState => TrashState.start(new Date(), WORLD_TRASH_RETENTION_DAYS);
  return writers.transactions.withActor(actor, async () => {
    const files = await insertEach(request.files ?? [], async (name) => {
      const file = await insertFileAs(writers, actor, name);
      await writers.trash.markFileTrashed(actor, file.id, startTrash());
      return file;
    });
    const folders = await insertEach(request.folders ?? [], async (name) => {
      const folder = await insertFolderAs(writers, actor, name);
      await writers.trash.markFolderSubtreeTrashed(actor, folder, startTrash());
      return worldFolderOf(folder);
    });
    return { files, folders };
  });
};

/** Marcas de `withQuickAccess`: estrictamente crecientes en todo el mundo, para que el orden sea el de la llamada. */
const quickAccessTicks = (() => {
  let last = 0;
  return (): Date => {
    last = Math.max(last + 1, Date.now());
    return new Date(last);
  };
})();

const insertQuickAccess = async (
  testApp: TestApp,
  owner: WorldAccount,
  request: WorldQuickAccessRequest,
): Promise<void> => {
  const { transactions, quickAccess } = storageWritersOf(testApp);
  const actor = clientActor(owner);
  await transactions.withActor(actor, async () => {
    for (const ref of request.pinned ?? []) {
      await quickAccess.upsertPin(actor, ref, quickAccessTicks());
    }
    for (const ref of request.opened ?? []) {
      await quickAccess.touchRecent(actor, ref, quickAccessTicks());
    }
  });
};

const insertUploads = async (
  testApp: TestApp,
  owner: WorldAccount,
  count: number,
): Promise<WorldUpload[]> => {
  const { transactions, sessions } = storageWritersOf(testApp);
  const actor = clientActor(owner);
  return transactions.withActor(actor, async () => {
    const uploads: WorldUpload[] = [];
    for (let index = 0; index < count; index += 1) {
      const session = UploadSession.start({
        id: randomUUID(),
        ownerId: owner.id,
        folderId: null,
        fileId: randomUUID(),
        versionId: randomUUID(),
        name: FileName.of(`carga-${String(index + 1)}.txt`),
        keepBoth: false,
        declaredBytes: WORLD_FILE_BYTES,
        multipart: null,
        /** Reloj real, como el `UploadService` de la app: la carga vence a las 24 h de ahora. */
        now: new Date(),
      });
      await sessions.insert(actor, session);
      uploads.push({ id: session.id, ownerId: owner.id });
    }
    return uploads;
  });
};

/**
 * Mundo de aislamiento (003 CA-15, D-3; plan §6.7). Las cuentas se insertan con el rol **dueño**
 * (`DATABASE_MIGRATION_URL`) porque son *fixtures*, no la aplicación; la app corre como `nimbo_app`. 005 agrega
 * `withFiles` y `withUploads`, que sí escriben como `nimbo_app` (con RLS); 006, `withFolders`, `withTrash` y `withQuickAccess`.
 */
export const createIsolationWorld = async (): Promise<IsolationWorld> => {
  const owner = await connectAsOwner();
  const [firstEmail, secondEmail] = nearlyIdenticalEmails();
  const clients = [
    aClient().withEmail(firstEmail).build(),
    aClient().withEmail(secondEmail).build(),
  ] as const;
  const internals = {
    [Role.ADMIN]: anInternal(Role.ADMIN).build(),
    [Role.SUPPORT]: anInternal(Role.SUPPORT).build(),
    [Role.OPERATOR]: anInternal(Role.OPERATOR).build(),
  };
  const accounts = [...clients, ...Object.values(internals)];
  await insertAll(owner, accounts);
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  return {
    clients,
    internals,
    tokenFor: (account) =>
      tokens.valid({ userId: account.id, role: account.role, sessionId: randomUUID() }),
    appAs: (options = {}) =>
      createTestApp({ ...options, env: { DATABASE_URL: requiredEnv('DATABASE_URL') } }),
    withFiles: insertFiles,
    withUploads: insertUploads,
    withFolders: insertFolders,
    withTrash: insertTrash,
    withQuickAccess: insertQuickAccess,
    close: async () => {
      const ids = accounts.map((account) => account.id);
      await owner.transaction(async (manager) => {
        await manager.query('DELETE FROM acceso_rapido WHERE usuario_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM carga WHERE propietario_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM archivo WHERE propietario_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM carpeta WHERE propietario_id = ANY($1)', [ids]);
        await manager.query('DELETE FROM usuario WHERE id = ANY($1)', [ids]);
      });
      await owner.destroy();
    },
  };
};
