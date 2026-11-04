import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

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
/** Copias que conserva la rotación (RN-2) y corridas de CA-3: una más que las que quedan. */
const KEPT_COPIES = 7;
const ROTATION_RUNS = KEPT_COPIES + 1;
/** Archivo ajeno del volumen: no es una copia final, así que la rotación ni lo cuenta ni lo borra. */
const FOREIGN_FILE = 'nimbo-20260101T000000Z.dump.gpg.tmp';

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
  readonly nextRunAt?: string;
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

/** Contraseña rechazada por Postgres: no debe aparecer en la salida. */
const WRONG_PASSWORD = 'contrasena-erronea-7Tq2';
/** Lo que nunca sale en la bitácora (plan §4): credenciales, host, ruta de la clave y texto de las herramientas. */
const FORBIDDEN_OUTPUT = [
  OWNER_PASSWORD,
  WRONG_PASSWORD,
  DB_ALIAS,
  PUBLIC_KEY_PATH,
  'pg_dump',
  'FATAL',
  'authentication',
  'gpg:',
];

/** Un fallo del respaldo: cómo provocarlo y cómo dejar el contenedor como estaba. */
interface FailureCase {
  readonly name: string;
  readonly code: string;
  readonly arrange: string;
  readonly undo: string;
  readonly env: Record<string, string>;
}

const FAILURES: readonly FailureCase[] = [
  {
    name: 'la contraseña del dueño es errónea',
    code: 'BACKUP_DUMP_FAILED',
    arrange: 'true',
    undo: 'true',
    env: { POSTGRES_PASSWORD: WRONG_PASSWORD },
  },
  {
    name: 'falta la clave pública',
    code: 'BACKUP_KEY_MISSING',
    arrange: `mv ${PUBLIC_KEY_PATH} /tmp/clave.bak`,
    undo: `mv /tmp/clave.bak ${PUBLIC_KEY_PATH}`,
    env: {},
  },
  {
    name: 'la clave pública no sirve para cifrar',
    code: 'BACKUP_ENCRYPT_FAILED',
    arrange: `cp ${PUBLIC_KEY_PATH} /tmp/clave.bak && echo 'no es una clave' > ${PUBLIC_KEY_PATH}`,
    undo: `mv /tmp/clave.bak ${PUBLIC_KEY_PATH}`,
    env: {},
  },
  {
    name: 'no se puede escribir en el volumen',
    code: 'BACKUP_WRITE_FAILED',
    arrange: `chmod 555 ${BACKUP_DIR}`,
    undo: `chmod 755 ${BACKUP_DIR}`,
    env: {},
  },
];

/** Espera al próximo segundo: dos corridas en el mismo segundo tendrían el mismo nombre. */
const nextSecond = (): Promise<void> =>
  new Promise((done) => setTimeout(done, 1000 - (Date.now() % 1000) + 10));

const parseLines = (stdout: string): BackupLine[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as BackupLine);

/**
 * Servicio de respaldos (022c CA-1, CA-2, CA-3, CA-4) con contenedores propios: el script real corre dentro de la imagen fijada de
 * Postgres, contra una base migrada con el corpus sintético, y llega a ella por el nombre `postgres` de su red.
 */
describe('servicio de respaldos (022c CA-1, CA-2, CA-3, CA-4)', () => {
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

  /** Nombre y hash de todo lo que hay en el volumen, temporales incluidos. */
  const volumeSnapshot = (): Promise<string> =>
    shell(`cd ${BACKUP_DIR} && ls -A | xargs -r sha256sum --`);

  describe('CA-2: un respaldo fallido', () => {
    beforeAll(async () => {
      await nextSecond();
      expect((await runBackup()).exitCode).toBe(0);
    });

    it.each(FAILURES)(
      'CA-2: si $name, registra backup.failed con $code, sale con 1, no deja temporal y las copias previas siguen iguales',
      async ({ code, arrange, undo, env }) => {
        const before = await volumeSnapshot();
        await shell(arrange);

        const result = await runBackup(env).finally(() => shell(undo));

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');
        const lines = parseLines(result.stdout);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ level: 50, event: 'backup.failed', code });
        expect(lines[0]?.durationMs).toBeGreaterThanOrEqual(0);
        expect(lines[0]).toHaveProperty('exitCode');
        expect(await volumeSnapshot()).toBe(before);
        for (const forbidden of FORBIDDEN_OUTPUT) expect(result.output).not.toContain(forbidden);
      },
    );
  });

  describe('CA-3: rotación', () => {
    const completed: BackupLine[] = [];

    beforeAll(async () => {
      await shell(`rm -f ${BACKUP_DIR}/* && touch ${BACKUP_DIR}/${FOREIGN_FILE}`);
      for (let run = 0; run < ROTATION_RUNS; run += 1) {
        await nextSecond();
        completed.push(...parseLines((await runBackup()).stdout));
      }
    });

    it('CA-3: tras 8 corridas quedan exactamente las 7 copias más recientes y la rotación ignora lo que no es una copia final', async () => {
      const names = completed.map((line) => line.backupFile);

      expect(completed.map((line) => line.event)).toEqual(
        Array.from({ length: ROTATION_RUNS }, () => 'backup.completed'),
      );
      expect(completed.map((line) => line.kept)).toEqual([1, 2, 3, 4, 5, 6, 7, 7]);
      expect(new Set(names).size).toBe(ROTATION_RUNS);
      expect((await backupFiles()).sort()).toEqual([...names.slice(1), FOREIGN_FILE].sort());
    });

    it('CA-3: un respaldo fallido no rota: con 7 copias, las 7 siguen iguales', async () => {
      const before = await volumeSnapshot();

      const result = await runBackup({ POSTGRES_PASSWORD: WRONG_PASSWORD });

      expect(result.exitCode).toBe(1);
      expect(await volumeSnapshot()).toBe(before);
    });
  });
});

const ROOT = resolve(__dirname, '../../../../..');
const BACKUP_SERVICE = 'backup';
const BACKUP_PROFILE = 'backups';
const BACKUP_VOLUME = 'backup_data';
const BACKUP_SECRET = 'backup_public_key';
/** Lo único que recibe el servicio (plan §2): ninguna credencial de la app. */
const SERVICE_ENVIRONMENT = [
  'BACKUP_TIME',
  'POSTGRES_DB',
  'POSTGRES_PASSWORD',
  'POSTGRES_USER',
  'TZ',
];
const SERVICE_TZ = 'America/Guatemala';
const FIXTURE_PASSWORD = 'clave-del-dueno-compose-8Wd3';
const COMPOSE_TIMEOUT_MS = 120_000;
/** Espera de la corrida programada: hasta dos minutos de reloj más el volcado. */
const SCHEDULE_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 5_000;
/** El contenedor tiene que arrancar antes del minuto programado; si queda menos, se programa el siguiente. */
const MIN_LEAD_SECONDS = 20;
const MINUTE_MS = 60_000;
/** `nextRunAt` debe caer dentro de esta ventana: si `TZ` no se aplicara, quedaría horas lejos. */
const MAX_SCHEDULE_AHEAD_MS = 3 * MINUTE_MS;

interface ComposeService {
  readonly image?: string;
  readonly entrypoint?: readonly string[];
  readonly command?: readonly string[];
  readonly environment?: Record<string, string>;
  readonly ports?: unknown;
  readonly env_file?: unknown;
  readonly volumes?: readonly {
    readonly type: string;
    readonly source?: string;
    readonly target: string;
  }[];
  readonly secrets?: readonly { readonly source: string }[];
  readonly restart?: string;
  readonly mem_limit?: unknown;
}

interface ComposeConfig {
  readonly services: Record<string, ComposeService>;
  readonly secrets?: Record<string, { readonly file?: string }>;
}

interface ComposeProject {
  readonly name: string;
  readonly envFile: string;
  readonly files: readonly string[];
  /**
   * Directorio del proyecto para `config`: ahí resuelve también los `env_file` (`.env`) de las apps, que este fixture
   * sustituye. Sin él, el de los archivos de compose (la raíz), para que los montajes de `./infra` existan al correr.
   */
  readonly projectDirectory?: string;
}

/** Entorno mínimo del CLI de Docker: nada del arnés (ni `COMPOSE_*`) pisa el archivo de entorno del proyecto. */
const dockerEnv = (): NodeJS.ProcessEnv => {
  const keep = [
    'PATH',
    'HOME',
    'DOCKER_HOST',
    'DOCKER_CONFIG',
    'DOCKER_CERT_PATH',
    'DOCKER_TLS_VERIFY',
  ];
  return Object.fromEntries(
    keep.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  );
};

const compose = (
  project: ComposeProject,
  args: readonly string[],
  timeout = COMPOSE_TIMEOUT_MS,
): SpawnSyncReturns<string> =>
  spawnSync(
    'docker',
    [
      'compose',
      ...['-p', project.name, '--env-file', project.envFile],
      ...(project.projectDirectory === undefined
        ? []
        : ['--project-directory', project.projectDirectory]),
      ...project.files.flatMap((file) => ['-f', join(ROOT, file)]),
      ...args,
    ],
    { cwd: ROOT, env: dockerEnv(), encoding: 'utf8', timeout },
  );

/** `docker compose config` resuelto; no vuelca la salida si falla: contiene credenciales, aunque sean sintéticas. */
const resolveConfig = (
  project: ComposeProject,
  profiles: readonly string[],
): { readonly config: ComposeConfig; readonly stderr: string } => {
  const result = compose(project, [
    ...profiles.flatMap((profile) => ['--profile', profile]),
    'config',
    '--format',
    'json',
  ]);
  if (result.status !== 0)
    throw new Error('Docker Compose no pudo resolver el fixture de configuración.');
  return { config: JSON.parse(result.stdout) as ComposeConfig, stderr: result.stderr };
};

/** `.env` del fixture: el de ejemplo con `overrides`; un valor `undefined` quita la variable. */
const writeEnvFile = (
  path: string,
  overrides: Readonly<Record<string, string | undefined>>,
): string => {
  const source: Record<string, string | undefined> = {
    ...parseEnv(readFileSync(join(ROOT, '.env.example'), 'utf8')),
    POSTGRES_PASSWORD: FIXTURE_PASSWORD,
    ...overrides,
  };
  const lines = Object.entries(source).flatMap(([key, value]) =>
    value === undefined ? [] : [`${key}=${value}`],
  );
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
};

/** Par de claves de prueba generado y desechado dentro de la imagen del servicio; solo sale la pública. */
const generatePublicKey = (): string => {
  const result = spawnSync(
    'docker',
    [
      ...['run', '--rm', '--entrypoint', 'bash', POSTGRES_IMAGE, '-c'],
      `export GNUPGHOME=$(mktemp -d) && gpg --batch --quiet --passphrase '' --quick-gen-key \
'Operador de prueba <operador@ejemplo.com>' future-default default never && gpg --batch --armor --export`,
    ],
    { env: dockerEnv(), encoding: 'utf8', timeout: COMPOSE_TIMEOUT_MS },
  );
  if (result.status !== 0) throw new Error('No se pudo generar la clave de prueba.');
  return result.stdout;
};

/** `HH:MM` en `SERVICE_TZ` del próximo minuto con al menos `MIN_LEAD_SECONDS` de margen. */
const scheduledMinute = (): string => {
  const at = new Date(Date.now() + MIN_LEAD_SECONDS * 1000 + MINUTE_MS);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SERVICE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
};

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Líneas JSON de la bitácora del servicio (`docker compose logs`). */
const serviceLines = (project: ComposeProject): BackupLine[] =>
  compose(project, ['logs', '--no-log-prefix', '--no-color', BACKUP_SERVICE])
    .stdout.split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as BackupLine);

const waitForEvent = async (project: ComposeProject, event: string): Promise<BackupLine[]> => {
  const deadline = Date.now() + SCHEDULE_TIMEOUT_MS;
  for (;;) {
    const lines = serviceLines(project);
    if (lines.some((line) => line.event === event) || Date.now() > deadline) return lines;
    await sleep(POLL_INTERVAL_MS);
  }
};

const servicesMounting = (config: ComposeConfig, volume: string): string[] =>
  Object.entries(config.services)
    .filter(([, service]) => (service.volumes ?? []).some((mount) => mount.source === volume))
    .map(([name]) => name);

/**
 * El servicio `backup` del compose (022c CA-1, CA-9): la forma que resuelve `docker compose config` con y sin el
 * perfil `backups`, y el servicio real corriendo `schedule` en un proyecto temporal que se borra al terminar.
 */
describe('servicio backup en compose (022c CA-1, CA-9)', () => {
  let dir = '';
  let publicKeyFile = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbo-backup-compose-'));
    publicKeyFile = join(dir, 'backup.pub.asc');
    writeFileSync(publicKeyFile, generatePublicKey());
  });

  afterAll(() => {
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
  });

  const projectFor = (
    files: readonly string[],
    overrides: Readonly<Record<string, string | undefined>>,
  ): ComposeProject => ({
    name: `nimbo-022c-${randomUUID().slice(0, 8)}`,
    envFile: writeEnvFile(join(mkdtempSync(join(dir, 'proyecto-')), '.env'), overrides),
    files,
  });

  const configProjectFor = (
    files: readonly string[],
    overrides: Readonly<Record<string, string | undefined>>,
  ): ComposeProject => {
    const project = projectFor(files, overrides);
    return { ...project, projectDirectory: dirname(project.envFile) };
  };

  describe.each([
    ['base', ['compose.yml']],
    ['local', ['compose.yml', 'compose.override.yml']],
  ])('CA-9: %s', (_name, files) => {
    let config: ComposeConfig;
    let service: ComposeService;

    beforeAll(() => {
      config = resolveConfig(configProjectFor(files, { BACKUP_PUBLIC_KEY_FILE: publicKeyFile }), [
        BACKUP_PROFILE,
      ]).config;
      service = config.services[BACKUP_SERVICE] ?? {};
    });

    it('CA-9: backup no publica puertos ni usa env_file y recibe solo las variables del respaldo', () => {
      expect(service.ports).toBeUndefined();
      expect(service.env_file).toBeUndefined();
      expect(Object.keys(service.environment ?? {}).sort()).toEqual(SERVICE_ENVIRONMENT);
      expect(service.environment).toMatchObject({
        POSTGRES_PASSWORD: FIXTURE_PASSWORD,
        BACKUP_TIME: '03:00',
        TZ: SERVICE_TZ,
      });
    });

    it('CA-9: usa la imagen de postgres con entrypoint propio, schedule, reinicio y tope de memoria', () => {
      expect(service.image).toBe(config.services.postgres?.image);
      expect(service.entrypoint?.join(' ')).toContain('backup.sh');
      expect(service.command).toEqual(['schedule']);
      expect(service.restart).toBe('unless-stopped');
      expect(service.mem_limit).toBeDefined();
    });

    it('CA-9: backup_data lo monta solo backup en /backups y la clave pública entra como secreto', () => {
      expect(servicesMounting(config, BACKUP_VOLUME)).toEqual([BACKUP_SERVICE]);
      const mount = service.volumes?.find((volume) => volume.source === BACKUP_VOLUME);
      expect(mount?.target).toBe(BACKUP_DIR);
      expect(service.secrets?.map((secret) => secret.source)).toEqual([BACKUP_SECRET]);
      expect(config.secrets?.[BACKUP_SECRET]?.file).toBe(publicKeyFile);
    });

    it('CA-9 (R-3): sin el perfil, compose no incluye backup ni pide BACKUP_PUBLIC_KEY_FILE', () => {
      const project = configProjectFor(files, { BACKUP_PUBLIC_KEY_FILE: undefined });

      const { config: withoutProfile, stderr } = resolveConfig(project, []);

      expect(Object.keys(withoutProfile.services)).not.toContain(BACKUP_SERVICE);
      expect(stderr).not.toContain('BACKUP_PUBLIC_KEY_FILE');
    });
  });

  describe('CA-1: el servicio programado', () => {
    let project: ComposeProject;

    beforeAll(() => {
      project = projectFor(['compose.yml'], { BACKUP_PUBLIC_KEY_FILE: publicKeyFile });
      expect(compose(project, ['up', '-d', '--wait', 'postgres']).status).toBe(0);
    });

    afterAll(() => {
      compose(project, ['--profile', BACKUP_PROFILE, 'down', '-v', '--remove-orphans']);
    });

    it(
      'CA-1: con BACKUP_TIME un minuto por delante, schedule deja la copia del día y registra backup.completed',
      async () => {
        writeEnvFile(project.envFile, {
          BACKUP_PUBLIC_KEY_FILE: publicKeyFile,
          BACKUP_TIME: scheduledMinute(),
        });
        expect(
          compose(project, ['--profile', BACKUP_PROFILE, 'up', '-d', BACKUP_SERVICE]).status,
        ).toBe(0);

        const [scheduled] = await waitForEvent(project, 'backup.scheduled');
        expect(Date.parse(scheduled?.nextRunAt ?? '') - Date.now()).toBeLessThan(
          MAX_SCHEDULE_AHEAD_MS,
        );
        const completed = (await waitForEvent(project, 'backup.completed')).find(
          (line) => line.event === 'backup.completed',
        );

        expect(completed).toMatchObject({ level: 30, kept: 1 });
        expect(completed?.sizeBytes).toBeGreaterThan(0);
        expect(completed?.durationMs).toBeGreaterThanOrEqual(0);
        const listing = compose(project, ['exec', '-T', BACKUP_SERVICE, 'ls', '-A', BACKUP_DIR]);
        expect(listing.stdout.trim()).toBe(completed?.backupFile);
        expect(completed?.backupFile).toMatch(BACKUP_FILE_PATTERN);
        expect(completed?.backupFile?.slice('nimbo-'.length, 'nimbo-'.length + 8)).toBe(
          new Date().toISOString().slice(0, 10).replaceAll('-', ''),
        );
      },
      SCHEDULE_TIMEOUT_MS + COMPOSE_TIMEOUT_MS,
    );

    it('CA-1 (R-3): sin BACKUP_PUBLIC_KEY_FILE, una corrida del servicio responde BACKUP_KEY_MISSING', () => {
      const envFile = writeEnvFile(join(dir, 'sin-clave.env'), {
        BACKUP_PUBLIC_KEY_FILE: undefined,
      });
      const withoutKey = { ...project, envFile };

      const result = compose(withoutKey, [
        '--profile',
        BACKUP_PROFILE,
        'run',
        '--rm',
        '-T',
        BACKUP_SERVICE,
        'run',
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('"code":"BACKUP_KEY_MISSING"');
    });
  });
});
