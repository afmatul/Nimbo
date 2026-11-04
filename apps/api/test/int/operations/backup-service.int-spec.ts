import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Network } from 'testcontainers';
import type { ExecResult, StartedNetwork, StartedTestContainer } from 'testcontainers';

import { createBackupCorpus } from '../../support/backup-corpus';
import type { BackupCorpus } from '../../support/backup-corpus';
import {
  APP_ROLE_SCRIPT_SOURCE,
  APP_ROLE_SCRIPT_TARGET,
  POSTGRES_IMAGE,
} from '../setup/containers';
import { runMigrations } from '../setup/migrate';

const SCRIPT_SOURCE = resolve(__dirname, '../../../../../infra/backup/backup.sh');
const SCRIPT_TARGET = '/opt/nimbo-backup/backup.sh';
/** Rutas fijas del script: el volumen `backup_data` y el secreto de compose con la clave pública. */
const BACKUP_DIR = '/backups';
const PUBLIC_KEY_PATH = '/run/secrets/backup_public_key';
/** Llavero temporal del «Operador», con la clave privada; el script nunca lo ve. */
const OPERATOR_GNUPG = '/tmp/operador-gnupg';
/** `backup.sh` habla con `postgres`, como el servicio del compose. */
const DB_ALIAS = 'postgres';
const OWNER_PASSWORD = 'clave-del-dueno-4Rk9';
const APP_DB_PASSWORD = 'nimbo_app';
const BACKUP_USER = 'postgres';
const BACKUP_FILE_PATTERN = /^nimbo-\d{8}T\d{6}Z\.dump\.gpg$/;

interface BackupLine {
  readonly level: number;
  readonly time: number;
  readonly event: string;
  readonly correlationId: string;
  readonly backupFile?: string;
  readonly sizeBytes?: number;
  readonly durationMs?: number;
  readonly kept?: number;
  readonly code?: string;
  readonly exitCode?: number | null;
}

const startPostgres = (network: StartedNetwork): Promise<StartedPostgreSqlContainer> =>
  new PostgreSqlContainer(POSTGRES_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(DB_ALIAS)
    .withPassword(OWNER_PASSWORD)
    .withCopyFilesToContainer([{ source: APP_ROLE_SCRIPT_SOURCE, target: APP_ROLE_SCRIPT_TARGET }])
    .withEnvironment({ NIMBO_APP_DB_PASSWORD: APP_DB_PASSWORD })
    .start();

/** El servicio `backup`: la imagen fijada de Postgres con *entrypoint* propio (no inicializa un clúster). */
const startBackup = (
  network: StartedNetwork,
  postgres: StartedPostgreSqlContainer,
): Promise<StartedTestContainer> =>
  new GenericContainer(POSTGRES_IMAGE)
    .withNetwork(network)
    .withEntrypoint(['sleep', 'infinity'])
    .withCopyFilesToContainer([{ source: SCRIPT_SOURCE, target: SCRIPT_TARGET }])
    .withEnvironment({
      POSTGRES_USER: postgres.getUsername(),
      POSTGRES_PASSWORD: OWNER_PASSWORD,
      POSTGRES_DB: postgres.getDatabase(),
      TZ: 'America/Guatemala',
    })
    .start();

/** Par de claves de prueba generado en el llavero temporal; solo la pública queda donde el script la lee. */
const KEY_SETUP = [
  `install -d -o ${BACKUP_USER} ${BACKUP_DIR}`,
  `install -d -m 700 ${OPERATOR_GNUPG}`,
  `install -d "$(dirname ${PUBLIC_KEY_PATH})"`,
  `gpg --batch --quiet --passphrase '' --quick-gen-key 'Operador de prueba <operador@ejemplo.com>' future-default default never`,
  `gpg --batch --armor --export > ${PUBLIC_KEY_PATH}`,
  `chmod 644 ${PUBLIC_KEY_PATH}`,
].join(' && ');

const parseLines = (stdout: string): BackupLine[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as BackupLine);

/**
 * Servicio de respaldos (022c CA-1, CA-4) con contenedores propios: el script real corre dentro de la imagen fijada de
 * Postgres, contra una base migrada con el corpus sintético, y llega a ella por el nombre `postgres` de su red.
 */
describe('servicio de respaldos (022c CA-1, CA-4)', () => {
  let network: StartedNetwork;
  let postgres: StartedPostgreSqlContainer;
  let backup: StartedTestContainer;
  let corpus: BackupCorpus;
  const savedEnv = { ...process.env };

  const inBackup = async (command: string, user = 'root'): Promise<ExecResult> =>
    backup.exec(['bash', '-c', command], { user, env: { GNUPGHOME: OPERATOR_GNUPG } });

  const shell = async (command: string): Promise<string> => {
    const result = await inBackup(command);
    expect(result.exitCode).toBe(0);
    return result.stdout.trim();
  };

  const runBackup = (env: Record<string, string> = {}): Promise<ExecResult> =>
    backup.exec(['bash', SCRIPT_TARGET, 'run'], { user: BACKUP_USER, env });

  const backupFiles = async (): Promise<string[]> =>
    (await shell(`ls -A ${BACKUP_DIR}`)).split('\n').filter((name) => name !== '');

  beforeAll(async () => {
    network = await new Network().start();
    postgres = await startPostgres(network);
    runMigrations(postgres.getConnectionUri());
    const appUrl = new URL(postgres.getConnectionUri());
    appUrl.username = 'nimbo_app';
    appUrl.password = APP_DB_PASSWORD;
    Object.assign(process.env, {
      DATABASE_MIGRATION_URL: postgres.getConnectionUri(),
      DATABASE_URL: appUrl.toString(),
    });
    corpus = await createBackupCorpus();
    backup = await startBackup(network, postgres);
    await shell(KEY_SETUP);
  });

  afterAll(async () => {
    await corpus.close();
    process.env = savedEnv;
    await backup.stop();
    await postgres.stop();
    await network.stop();
  });

  it('CA-1: run deja una copia nimbo-<AAAAMMDD>T<HHMMSS>Z.dump.gpg y registra backup.completed con tamaño y duración', async () => {
    const result = await runBackup();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const [line, ...rest] = parseLines(result.stdout);
    expect(rest).toEqual([]);
    expect(line).toMatchObject({ level: 30, event: 'backup.completed', kept: 1 });
    expect(line?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line?.backupFile).toMatch(BACKUP_FILE_PATTERN);
    expect(line?.durationMs).toBeGreaterThanOrEqual(0);
    expect(await backupFiles()).toEqual([line?.backupFile]);
    const size = await shell(`stat -c %s ${BACKUP_DIR}/${line?.backupFile ?? ''}`);
    expect(line?.sizeBytes).toBe(Number(size));
    expect(line?.sizeBytes).toBeGreaterThan(0);
  });

  it('CA-1: la copia es el volcado custom de la base con el corpus: con la clave del Operador, pg_restore la lee', async () => {
    const counts = await corpus.controlCounts();
    const [file] = await backupFiles();

    // Centinela: sin corpus, el respaldo pasaría en vacío.
    expect(counts.objects).toBe(corpus.objects.length);
    expect(counts.rows.fragmento).toBe(corpus.objects.length);
    const listing = await shell(
      `gpg --batch --quiet --decrypt ${BACKUP_DIR}/${file ?? ''} | pg_restore --list`,
    );
    for (const table of ['usuario', 'archivo', 'version_archivo', 'fragmento', 'suscripcion']) {
      expect(listing).toContain(`TABLE DATA public ${table} `);
    }
  });

  it('CA-4: sin la clave privada nada es legible: pg_restore --list sobre el archivo cifrado y gpg sin la clave fallan', async () => {
    const [file] = await backupFiles();
    const path = `${BACKUP_DIR}/${file ?? ''}`;

    const restoreList = await inBackup(`pg_restore --list ${path}`);
    const withoutKey = await inBackup(
      `GNUPGHOME=$(mktemp -d) gpg --batch --decrypt ${path} > /dev/null`,
    );

    expect(restoreList.exitCode).not.toBe(0);
    expect(withoutKey.exitCode).not.toBe(0);
  });
});
