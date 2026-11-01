import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

import { workerOptimizerEnvSchema } from '../apps/api/src/shared/infrastructure/config/env.schema';

const ROOT = resolve(__dirname, '..');
const FIXTURE = {
  DATABASE_URL: 'postgres://owner:migration-only-credential@localhost:5432/nimbo',
  DATABASE_MIGRATION_URL: 'postgres://owner:migration-only-credential@localhost:5432/nimbo',
  POSTGRES_PASSWORD: 'owner-only-credential',
  POSTGRES_DB: 'nimbo',
  NIMBO_APP_DB_PASSWORD: 'application-only-credential',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'application-key',
  MINIO_SECRET_KEY: 'application-object-credential',
  MINIO_ROOT_PASSWORD: 'root-object-credential',
  SMTP_PASSWORD: 'mail-only-credential',
  GEMINI_API_KEY: 'embedding-only-credential',
  JWT_ACCESS_SECRET: 'token-only-credential',
  ONLYOFFICE_JWT_SECRET: 'editor-only-credential',
};
const FOREIGN_KEYS =
  /^(DATABASE_MIGRATION_URL|POSTGRES_|NIMBO_APP_DB_PASSWORD|MINIO_ROOT_|SMTP_|MAIL_|GEMINI_|JWT_|ONLYOFFICE_|INDEX)/;
const compositions: [string, string[]][] = [
  ['base', ['compose.yml']],
  ['local/apps', ['compose.yml', 'compose.override.yml']],
];
if (existsSync(join(ROOT, 'compose.staging.yml'))) {
  compositions.push(['staging', ['compose.yml', 'compose.staging.yml']]);
}

interface OptimizerService {
  readonly environment: Record<string, string>;
  readonly env_file?: unknown;
}

describe('021 T-10: Compose y schema del optimizador', () => {
  let project = '';
  let source: Record<string, string>;

  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'nimbo-optimizer-compose-'));
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    source = { ...parseEnv(example), ...FIXTURE };
    const content = Object.entries(source)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    // `--project-directory` hace que también los env_file se resuelvan contra este fixture, nunca el `.env` local.
    writeFileSync(join(project, '.env'), content);
  });

  afterAll(() => {
    if (project !== '') rmSync(project, { recursive: true, force: true });
  });

  const serviceOf = (files: readonly string[]): OptimizerService => {
    const args = [
      'compose',
      '--project-directory',
      project,
      '--env-file',
      join(project, '.env'),
      ...files.flatMap((file) => ['-f', join(ROOT, file)]),
      '--profile',
      'apps',
      'config',
      '--format',
      'json',
    ];
    const result = spawnSync('docker', args, {
      cwd: ROOT,
      env: { ...process.env, ...source, COMPOSE_FILE: '' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    // No volcar stdout/stderr: config contiene credenciales, aunque aquí sean sintéticas.
    if (result.status !== 0)
      throw new Error('Docker Compose no pudo resolver el fixture de configuración.');
    const config = JSON.parse(result.stdout) as { services: Record<string, OptimizerService> };
    const service = config.services['worker-optimizer'];
    if (service === undefined) throw new Error('Falta worker-optimizer en Compose.');
    return service;
  };

  describe.each(compositions)('%s', (_name, files) => {
    let service: OptimizerService;
    beforeAll(() => {
      service = serviceOf(files);
    });

    it('el environment efectivo coincide exactamente con el schema y no usa env_file', () => {
      expect(Object.keys(service.environment).sort()).toEqual(
        Object.keys(workerOptimizerEnvSchema.shape).sort(),
      );
      expect(workerOptimizerEnvSchema.safeParse(service.environment).success).toBe(true);
      expect(service.env_file).toBeUndefined();
    });

    it('no recibe variables ni credenciales de migración, root, SMTP, Gemini, JWT o ONLYOFFICE', () => {
      const env = service.environment;
      expect(Object.keys(env).filter((key) => FOREIGN_KEYS.test(key))).toEqual([]);
      const values = Object.values(env).join('\n');
      for (const credential of [
        'migration-only-credential',
        FIXTURE.POSTGRES_PASSWORD,
        FIXTURE.MINIO_ROOT_PASSWORD,
        FIXTURE.SMTP_PASSWORD,
        FIXTURE.GEMINI_API_KEY,
        FIXTURE.JWT_ACCESS_SECRET,
        FIXTURE.ONLYOFFICE_JWT_SECRET,
      ])
        expect(values).not.toContain(credential);
      expect(env.MINIO_ACCESS_KEY).toBe(FIXTURE.MINIO_ACCESS_KEY);
      expect(env.MINIO_SECRET_KEY).toBe(FIXTURE.MINIO_SECRET_KEY);
    });

    it('usa nimbo_app y endpoints internos alcanzables en la red Compose, no el loopback del host', () => {
      const database = new URL(service.environment.DATABASE_URL ?? '');
      expect([database.username, database.hostname, database.port, database.pathname]).toEqual([
        'nimbo_app',
        'postgres',
        '5432',
        '/nimbo',
      ]);
      expect(decodeURIComponent(database.password)).toBe(FIXTURE.NIMBO_APP_DB_PASSWORD);
      expect(service.environment.REDIS_URL).toBe('redis://redis:6379');
      expect(service.environment.MINIO_ENDPOINT).toBe('http://minio:9000');
    });
  });
});
