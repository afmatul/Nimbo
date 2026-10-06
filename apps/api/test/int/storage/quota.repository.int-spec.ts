import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { DataSource } from 'typeorm';

import { TypeOrmQuotaRepository } from '../../../src/modules/storage/infrastructure/persistence/typeorm-quota.repository';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { connectAsOwner } from '../../support/database-urls';

import {
  connectAsAppDatabase,
  insertAccount,
  insertUpload,
  removeAccounts,
} from './storage-test-db';
import type { AppDatabase } from './storage-test-db';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date();
const STORAGE_SRC = join(__dirname, '../../../src/modules/storage');
const QUOTA_REPOSITORY_FILE = 'infrastructure/persistence/typeorm-quota.repository.ts';
/** Única extensión de la excepción DF-59 (DF-62, 007 D-12): lista ids de cuentas de cliente, nada más. */
const CLIENT_ACCOUNT_SCANNER_FILE = 'infrastructure/persistence/sql-client-account.scanner.ts';
const SQL_ON_USUARIO = /\b(FROM|UPDATE|JOIN|INTO)\s+"?usuario"?\b/i;
/** Tiempo que la segunda transacción debe seguir bloqueada mientras la primera tiene la fila. */
const LOCK_PROBE_MS = 300;

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/.*$/gm;

/** Código sin comentarios: la documentación puede citar la sentencia; lo que cuenta es el SQL que se ejecuta. */
const codeOf = (file: string): string =>
  readFileSync(file, 'utf8').replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');

const sourceFilesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFilesUnder(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(dir, entry.name)]
        : [],
  );

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** `IQuotaRepository` sobre Postgres como `nimbo_app` dentro de `withActor` (plan §6 «Puertos», D-5, DF-59). */
describe('TypeOrmQuotaRepository (CA-4, CA-23, RN-10)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmQuotaRepository;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const usuarioRow = async (id: string): Promise<Record<string, unknown>> => {
    const [row] = (await owner.query('SELECT to_jsonb(u) AS fila FROM usuario u WHERE u.id = $1', [
      id,
    ])) as { fila: Record<string, unknown> }[];
    return row?.fila ?? {};
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmQuotaRepository(app.context);
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    await owner.query('UPDATE usuario SET espacio_usado = 5000 WHERE id = $1', [ana.id]);
    await app.asActor(ana, async (manager) => {
      await insertUpload(manager, ana.id, {
        sizeBytes: 100n,
        expiresAt: new Date(NOW.getTime() + HOUR_MS),
      });
      await insertUpload(manager, ana.id, {
        sizeBytes: 20n,
        mode: 'por_partes',
        expiresAt: new Date(NOW.getTime() + HOUR_MS),
      });
      await insertUpload(manager, ana.id, {
        sizeBytes: 1000n,
        expiresAt: new Date(NOW.getTime() - HOUR_MS),
      });
      await insertUpload(manager, ana.id, { sizeBytes: 10_000n, state: 'cancelada' });
      await insertUpload(manager, ana.id, { sizeBytes: 30_000n, state: 'completada' });
    });
    await app.asActor(bruno, (manager) => insertUpload(manager, bruno.id, { sizeBytes: 100_000n }));
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-4: `lockUsage` devuelve `espacio_usado` como `bigint` y no suma reservas', async () => {
    await expect(app.asActor(ana, () => repository.lockUsage(ana))).resolves.toBe(5000n);
  });

  it('CA-23: `lockAndReadUsage` suma solo las cargas `activa` no vencidas del actor', async () => {
    const usage = await app.asActor(ana, () => repository.lockAndReadUsage(ana, NOW));

    expect(usage).toEqual({ usedBytes: 5000n, reservedBytes: 120n });
  });

  it('CA-23: una carga que vence justo en `now` ya no reserva', async () => {
    const later = new Date(NOW.getTime() + HOUR_MS + 1);

    const usage = await app.asActor(ana, () => repository.lockAndReadUsage(ana, later));

    expect(usage).toEqual({ usedBytes: 5000n, reservedBytes: 0n });
  });

  it('007 D-1: `readUsage` lee lo usado y lo reservado sin esperar a quien tiene la fila bloqueada', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });
    const first = app.asActor(ana, async () => {
      await repository.lockUsage(ana);
      firstLocked();
      await firstHolds;
    });
    await lockTaken;

    const usage = await app.asActor(ana, () => repository.readUsage(ana, NOW));
    releaseFirst();
    await first;

    expect(usage).toEqual({ usedBytes: 5000n, reservedBytes: 120n });
  });

  it('RN-10: `addUsedBytes` suma el delta y ninguna otra columna de `usuario` cambia', async () => {
    const before = await usuarioRow(bruno.id);

    await app.asActor(bruno, () => repository.addUsedBytes(bruno, 4096n));

    const after = await usuarioRow(bruno.id);
    expect(after).toEqual({ ...before, espacio_usado: 4096 });
    await expect(app.asActor(bruno, () => repository.lockUsage(bruno))).resolves.toBe(4096n);
  });

  it('CA-23: dos transacciones sobre el mismo usuario se serializan por el `FOR UPDATE`', async () => {
    let secondRead: bigint | undefined;
    let releaseFirst: () => void = () => undefined;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });

    const first = app.asActor(ana, async () => {
      await repository.lockUsage(ana);
      firstLocked();
      await firstHolds;
      await repository.addUsedBytes(ana, 7n);
    });
    await lockTaken;
    const second = app.asActor(ana, async () => {
      secondRead = await repository.lockUsage(ana);
    });
    await delay(LOCK_PROBE_MS);
    const blockedWhileFirstHeld = secondRead === undefined;
    releaseFirst();
    await Promise.all([first, second]);

    expect(blockedWhileFirstHeld).toBe(true);
    expect(secondRead).toBe(5007n);
  });

  it('CA-16: todo método exige `withActor`', async () => {
    await expect(repository.lockUsage(ana)).rejects.toBeInstanceOf(ActorScopeMissingError);
    await expect(repository.lockAndReadUsage(ana, NOW)).rejects.toBeInstanceOf(
      ActorScopeMissingError,
    );
    await expect(repository.addUsedBytes(ana, 1n)).rejects.toBeInstanceOf(ActorScopeMissingError);
    await expect(repository.readUsage(ana, NOW)).rejects.toBeInstanceOf(ActorScopeMissingError);
  });

  it('D-5, DF-62: solo el repositorio de cuota y el escáner de cuentas tienen SQL contra `usuario`', () => {
    const offenders = sourceFilesUnder(STORAGE_SRC)
      .filter((file) => SQL_ON_USUARIO.test(codeOf(file)))
      .map((file) => relative(STORAGE_SRC, file).split('\\').join('/'));

    expect(offenders.sort()).toEqual([CLIENT_ACCOUNT_SCANNER_FILE, QUOTA_REPOSITORY_FILE]);
  });
});
