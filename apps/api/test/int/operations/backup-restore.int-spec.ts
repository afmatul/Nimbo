import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, Network } from 'testcontainers';
import type { ExecResult, StartedNetwork, StartedTestContainer } from 'testcontainers';
import type { DataSource } from 'typeorm';

import { createBackupCorpus, controlCounts } from '../../support/backup-corpus';
import type { BackupCorpus, ControlCounts } from '../../support/backup-corpus';
import { connectTo } from '../../support/database-urls';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import {
  APP_ROLE_SCRIPT_SOURCE,
  APP_ROLE_SCRIPT_TARGET,
  POSTGRES_IMAGE,
} from '../setup/containers';
import { runMigrations } from '../setup/migrate';
import { buildTestEnv } from '../setup/test-app';

const SCRIPT_DIR_SOURCE = resolve(__dirname, '../../../../../infra/backup');
/** Igual que el servicio `backup` del compose: el directorio montado y `backup.sh` como *entrypoint*. */
const SCRIPT_DIR_TARGET = '/opt/nimbo-backup';
const ENTRYPOINT = ['bash', `${SCRIPT_DIR_TARGET}/backup.sh`];
const BACKUP_DIR = '/backups';
const PUBLIC_KEY_PATH = '/run/secrets/backup_public_key';
/** Donde el Operador monta su clave privada con `-v`, solo en la corrida de `restore`. */
const PRIVATE_KEY_PATH = '/run/secrets/backup_private_key';
/** Claves exportadas del «Operador» y de un tercero; nacen en el contenedor de origen y viajan al de destino. */
const KEYS_DIR = '/claves';
const OPERATOR_KEY = `${KEYS_DIR}/operador.priv.asc`;
const FOREIGN_KEY = `${KEYS_DIR}/otra.priv.asc`;
const DB_ALIAS = 'postgres';
const OWNER_PASSWORD = 'clave-del-dueno-6Hn2';
const APP_DB_PASSWORD = 'nimbo_app';
const BACKUP_USER = 'postgres';
/** Una copia con el nombre de una copia final, pero cortada: `gpg` debe notar que está incompleta. */
const TRUNCATED_FILE = 'nimbo-20260101T000000Z.dump.gpg';
const TRUNCATED_BYTES = 200;
/** Tablas con RLS forzada en la base migrada: centinela de que la comparación no se hace en vacío. */
const MIN_FORCED_RLS_TABLES = 10;
const FORBIDDEN_OUTPUT = [
  OWNER_PASSWORD,
  DB_ALIAS,
  PRIVATE_KEY_PATH,
  'pg_restore',
  'gpg:',
  'ERROR',
];

interface RestoreLine {
  readonly level: number;
  readonly event: string;
  readonly correlationId: string;
  readonly backupFile?: string;
  readonly durationMs?: number;
  readonly code?: string;
}

/** Lo que la restauración debe conservar del aislamiento: RLS, políticas y permisos de `nimbo_app`. */
interface IsolationSnapshot {
  readonly tables: readonly unknown[];
  readonly policies: readonly unknown[];
  readonly grants: readonly unknown[];
}

const startPostgres = (network: StartedNetwork): Promise<StartedPostgreSqlContainer> =>
  new PostgreSqlContainer(POSTGRES_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(DB_ALIAS)
    .withPassword(OWNER_PASSWORD)
    .withCopyFilesToContainer([{ source: APP_ROLE_SCRIPT_SOURCE, target: APP_ROLE_SCRIPT_TARGET }])
    .withEnvironment({ NIMBO_APP_DB_PASSWORD: APP_DB_PASSWORD })
    .start();

/** El servicio `backup` junto a `postgres`: misma imagen, scripts en su directorio, solo las variables del dueño. */
const startBackup = (
  network: StartedNetwork,
  postgres: StartedPostgreSqlContainer,
): Promise<StartedTestContainer> =>
  new GenericContainer(POSTGRES_IMAGE)
    .withNetwork(network)
    .withEntrypoint(['sleep', 'infinity'])
    .withCopyDirectoriesToContainer([{ source: SCRIPT_DIR_SOURCE, target: SCRIPT_DIR_TARGET }])
    .withEnvironment({
      POSTGRES_USER: postgres.getUsername(),
      POSTGRES_PASSWORD: OWNER_PASSWORD,
      POSTGRES_DB: postgres.getDatabase(),
    })
    .start();

const keygen = (name: string, file: string): string =>
  [
    `export GNUPGHOME=$(mktemp -d)`,
    `gpg --batch --quiet --passphrase '' --quick-gen-key '${name}' future-default default never`,
    `gpg --batch --armor --export-secret-keys > ${file}`,
  ].join(' && ');

/** Dos pares de claves de prueba; la pública del Operador queda donde la lee `backup.sh`. */
const KEY_SETUP = [
  `install -d -o ${BACKUP_USER} ${BACKUP_DIR} && install -d ${KEYS_DIR} "$(dirname ${PUBLIC_KEY_PATH})"`,
  `(${keygen('Operador de prueba <operador@ejemplo.com>', OPERATOR_KEY)} && gpg --batch --armor --export > ${PUBLIC_KEY_PATH})`,
  `(${keygen('Tercero de prueba <tercero@ejemplo.com>', FOREIGN_KEY)})`,
  `chmod 644 ${PUBLIC_KEY_PATH} ${KEYS_DIR}/*`,
].join(' && ');

const exec = async (container: StartedTestContainer, command: string): Promise<string> => {
  const result = await container.exec(['bash', '-c', command]);
  if (result.exitCode !== 0) throw new Error(`Falló la preparación: ${command}`);
  return result.stdout.trim();
};

/** Copia un directorio de un contenedor a otro (el volumen y las claves «viajan» al servidor de destino). */
const copyDirectory = async (
  from: StartedTestContainer,
  to: StartedTestContainer,
  path: string,
): Promise<void> => {
  const archive = await from.copyArchiveFromContainer(path);
  await to.copyArchiveToContainer(Readable.from(archive), '/');
};

const parseLines = (stdout: string): RestoreLine[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RestoreLine);

const publicTables = async (db: DataSource): Promise<number> => {
  const [row] = (await db.query(
    "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'",
  )) as { n: number }[];
  return row?.n ?? 0;
};

const isolationSnapshot = async (db: DataSource): Promise<IsolationSnapshot> => ({
  tables: (await db.query(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
  )) as unknown[],
  policies: (await db.query(
    // Sin `qual`/`with_check`: Postgres vuelve a escribir algunas expresiones al recargarlas (p. ej. `ANY (ARRAY[…])`
    // con otros *casts*), así que su texto cambia sin cambiar su sentido.
    `SELECT tablename, policyname, permissive, roles::text, cmd FROM pg_policies
      WHERE schemaname = 'public' ORDER BY tablename, policyname`,
  )) as unknown[],
  grants: (await db.query(
    `SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'nimbo_app' AND table_schema = 'public' ORDER BY table_name, privilege_type`,
  )) as unknown[],
});

const appUrlOf = (postgres: StartedPostgreSqlContainer): string => {
  const url = new URL(postgres.getConnectionUri());
  url.username = 'nimbo_app';
  url.password = APP_DB_PASSWORD;
  return url.toString();
};

/**
 * Restauración de punta a punta (022c CA-4, CA-5, CA-6): la base A migrada con el corpus sintético se respalda con
 * `backup.sh run`; la copia y las claves viajan a otro «servidor» con una base B nueva (volumen nuevo con
 * `10-nimbo-app.sh`, sin tablas), y `backup.sh restore` la restaura allí. Cada base tiene su propia red, donde se
 * llama `postgres`, como en el compose.
 */
describe('restauración de respaldos (022c CA-4, CA-5, CA-6)', () => {
  let networkA: StartedNetwork;
  let networkB: StartedNetwork;
  let postgresA: StartedPostgreSqlContainer;
  let postgresB: StartedPostgreSqlContainer;
  let backupA: StartedTestContainer;
  let backupB: StartedTestContainer;
  let corpus: BackupCorpus;
  let ownerB: DataSource;
  let countsA: ControlCounts;
  let snapshotA: IsolationSnapshot;
  let backupFile = '';
  const savedEnv = { ...process.env };

  const restore = (container: StartedTestContainer, file: string): Promise<ExecResult> =>
    container.exec([...ENTRYPOINT, 'restore', file], { user: BACKUP_USER });

  const useKey = (container: StartedTestContainer, key: string): Promise<string> =>
    exec(container, `install -m 644 ${key} ${PRIVATE_KEY_PATH}`);

  const prepareOrigin = async (): Promise<void> => {
    networkA = await new Network().start();
    postgresA = await startPostgres(networkA);
    runMigrations(postgresA.getConnectionUri());
    Object.assign(process.env, {
      DATABASE_MIGRATION_URL: postgresA.getConnectionUri(),
      DATABASE_URL: appUrlOf(postgresA),
    });
    corpus = await createBackupCorpus();
    countsA = await corpus.controlCounts();
    const ownerA = await connectTo(postgresA.getConnectionUri());
    snapshotA = await isolationSnapshot(ownerA);
    await ownerA.destroy();
  };

  const backUpOrigin = async (): Promise<void> => {
    backupA = await startBackup(networkA, postgresA);
    await exec(backupA, KEY_SETUP);
    const result = await backupA.exec([...ENTRYPOINT, 'run'], { user: BACKUP_USER });
    if (result.exitCode !== 0) throw new Error('El respaldo de la base A falló.');
    backupFile = parseLines(result.stdout)[0]?.backupFile ?? '';
  };

  const prepareTarget = async (): Promise<void> => {
    networkB = await new Network().start();
    postgresB = await startPostgres(networkB);
    backupB = await startBackup(networkB, postgresB);
    await copyDirectory(backupA, backupB, BACKUP_DIR);
    await copyDirectory(backupA, backupB, KEYS_DIR);
    await exec(
      backupB,
      `install -d "$(dirname ${PRIVATE_KEY_PATH})" && cd ${BACKUP_DIR} && ` +
        `head -c ${TRUNCATED_BYTES} ${backupFile} > ${TRUNCATED_FILE} && chown -R ${BACKUP_USER} .`,
    );
    ownerB = await connectTo(postgresB.getConnectionUri());
  };

  beforeAll(async () => {
    await prepareOrigin();
    await backUpOrigin();
    await prepareTarget();
  });

  afterAll(async () => {
    await ownerB.destroy();
    await corpus.close();
    process.env = savedEnv;
    for (const container of [backupB, postgresB, backupA, postgresA]) await container.stop();
    await networkB.stop();
    await networkA.stop();
  });

  const expectFailure = (result: ExecResult, code: string): void => {
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    const lines = parseLines(result.stdout);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 50, event: 'restore.failed', code });
    expect(lines[0]?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0]?.durationMs).toBeGreaterThanOrEqual(0);
    for (const forbidden of FORBIDDEN_OUTPUT) expect(result.output).not.toContain(forbidden);
  };

  describe('CA-4: sin la clave del Operador nada se restaura', () => {
    it.each([
      ['con la clave de un tercero', FOREIGN_KEY, () => backupFile],
      ['con un archivo truncado', OPERATOR_KEY, () => TRUNCATED_FILE],
    ])(
      'CA-4: %s → RESTORE_KEY_INVALID y la base destino sigue sin tablas',
      async (_name, key, file) => {
        await useKey(backupB, key);

        const result = await restore(backupB, file());

        expectFailure(result, 'RESTORE_KEY_INVALID');
        expect(await publicTables(ownerB)).toBe(0);
      },
    );

    it('CA-4: sin la clave privada montada → RESTORE_KEY_INVALID y la base destino sigue sin tablas', async () => {
      await exec(backupB, `rm -f ${PRIVATE_KEY_PATH}`);

      const result = await restore(backupB, backupFile);

      expectFailure(result, 'RESTORE_KEY_INVALID');
      expect(await publicTables(ownerB)).toBe(0);
    });

    it('CA-4: una copia que no está en el volumen → RESTORE_FILE_NOT_FOUND', async () => {
      await useKey(backupB, OPERATOR_KEY);

      const result = await restore(backupB, 'nimbo-20250101T000000Z.dump.gpg');

      expectFailure(result, 'RESTORE_FILE_NOT_FOUND');
      expect(await publicTables(ownerB)).toBe(0);
    });
  });

  describe('CA-5: restaurar sobre una base vacía', () => {
    let restored: ExecResult;

    beforeAll(async () => {
      await useKey(backupB, OPERATOR_KEY);
      restored = await restore(backupB, backupFile);
    });

    it('CA-5: restore termina con restore.completed, el archivo y la duración', () => {
      expect(restored.exitCode).toBe(0);
      expect(restored.stderr).toBe('');
      const [line, ...rest] = parseLines(restored.stdout);
      expect(rest).toEqual([]);
      expect(line).toMatchObject({ level: 30, event: 'restore.completed', backupFile });
      expect(line?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('CA-5: los conteos de control coinciden con los de la base de origen', async () => {
      expect(countsA.objects).toBe(corpus.objects.length);
      expect(countsA.rows.usuario).toBeGreaterThan(0);

      expect(await controlCounts(ownerB, corpus.storage, corpus.objects)).toEqual(countsA);
    });

    it('CA-5: todas las tablas de public conservan su RLS, sus políticas y los permisos de nimbo_app', async () => {
      const forced = snapshotA.tables.filter(
        (table) => (table as { relforcerowsecurity: boolean }).relforcerowsecurity,
      );
      expect(forced.length).toBeGreaterThanOrEqual(MIN_FORCED_RLS_TABLES);

      expect(await isolationSnapshot(ownerB)).toEqual(snapshotA);
    });

    it('CA-5: migration:run no tiene pendientes en la base restaurada (applied: [])', () => {
      const output = runMigrations(postgresB.getConnectionUri());

      const run = parseLines(output).find((line) => line.event === 'migration.run');
      expect(run).toEqual({ event: 'migration.run', applied: [] });
    });

    it('CA-5: la API conectada a la base restaurada como nimbo_app responde 200 en /api/v1/health/ready', async () => {
      const app = await createFullApiTestApp(buildTestEnv({ DATABASE_URL: appUrlOf(postgresB) }));
      try {
        const response = await request(app.app.getHttpServer()).get('/api/v1/health/ready');

        expect(response.status).toBe(200);
      } finally {
        await app.close();
      }
    });
  });

  describe('CA-6: base destino con tablas', () => {
    it('CA-6: restore sobre la base de origen → RESTORE_TARGET_NOT_EMPTY y sus conteos no cambian', async () => {
      await useKey(backupA, OPERATOR_KEY);

      const result = await restore(backupA, backupFile);

      expectFailure(result, 'RESTORE_TARGET_NOT_EMPTY');
      expect(await corpus.controlCounts()).toEqual(countsA);
    });
  });
});
