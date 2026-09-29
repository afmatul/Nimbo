import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkEnvExample, collectSchemaKeys, parseEnvExample } from './check-env-example';

const ROOT = join(__dirname, '..');

const schemas = {
  api: ['NODE_ENV', 'DATABASE_URL', 'MINIO_SECRET_KEY'],
  worker: ['NODE_ENV', 'REDIS_URL'],
  web: ['APP_ENV', 'API_INTERNAL_URL'],
};
const secrets = ['MINIO_SECRET_KEY'];

const example = (lines: string[]): string => lines.join('\n');

describe('checkEnvExample (CA-19)', () => {
  it('CA-19: una variable del esquema ausente en `.env.example` → falla y la nombra con su proceso', () => {
    const result = checkEnvExample({
      exampleKeys: parseEnvExample(
        example([
          'NODE_ENV=development',
          'REDIS_URL=redis://x',
          'APP_ENV=local',
          'API_INTERNAL_URL=http://x',
        ]),
      ),
      schemas,
      secrets,
    });

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      '`DATABASE_URL` (api) falta en .env.example',
      '`MINIO_SECRET_KEY` (api) falta en .env.example',
    ]);
  });

  it('CA-19: una clave secreta con prefijo `NEXT_PUBLIC_` → falla', () => {
    const result = checkEnvExample({
      exampleKeys: parseEnvExample(
        example([
          'NODE_ENV=development',
          'DATABASE_URL=postgres://x',
          'MINIO_SECRET_KEY=',
          'REDIS_URL=redis://x',
          'APP_ENV=local',
          'API_INTERNAL_URL=http://x',
          'NEXT_PUBLIC_MINIO_SECRET_KEY=filtrada',
        ]),
      ),
      schemas,
      secrets,
    });

    expect(result).toEqual({
      ok: false,
      problems: ['`NEXT_PUBLIC_MINIO_SECRET_KEY` expone un secreto al navegador (CA-19, CA-29)'],
    });
  });

  it('CA-19: un archivo completo → `ok` sin problemas (los comentarios y líneas vacías se ignoran)', () => {
    const result = checkEnvExample({
      exampleKeys: parseEnvExample(
        example([
          '# comentario',
          '',
          'NODE_ENV=development',
          'DATABASE_URL=postgres://x',
          'MINIO_SECRET_KEY=',
          'REDIS_URL=redis://x',
          'APP_ENV=local',
          'API_INTERNAL_URL=http://x',
          '# COMPOSE_FILE=compose.yml',
        ]),
      ),
      schemas,
      secrets,
    });

    expect(result).toEqual({ ok: true, problems: [] });
  });

  it('CA-19: el `.env.example` del repositorio cubre los esquemas reales de api, worker y web', () => {
    const result = checkEnvExample({
      exampleKeys: parseEnvExample(readFileSync(join(ROOT, '.env.example'), 'utf8')),
      ...collectSchemaKeys(),
    });

    expect(result).toEqual({ ok: true, problems: [] });
  });

  it('CA-13: el grupo `migrations` exige `DATABASE_MIGRATION_URL` en `.env.example` (003 plan §6.10)', () => {
    const real = collectSchemaKeys();
    const exampleKeys = new Set(
      [...parseEnvExample(readFileSync(join(ROOT, '.env.example'), 'utf8'))].filter(
        (key) => key !== 'DATABASE_MIGRATION_URL',
      ),
    );

    expect(real.schemas['migrations']).toEqual(['DATABASE_MIGRATION_URL']);
    expect(checkEnvExample({ exampleKeys, ...real })).toEqual({
      ok: false,
      problems: ['`DATABASE_MIGRATION_URL` (migrations) falta en .env.example'],
    });
  });

  it('CA-19: `NEXT_PUBLIC_SMTP_PASSWORD` expone el secreto SMTP del worker (001 plan §6.10)', () => {
    const real = collectSchemaKeys();
    const exampleKeys = new Set([
      ...parseEnvExample(readFileSync(join(ROOT, '.env.example'), 'utf8')),
      'NEXT_PUBLIC_SMTP_PASSWORD',
    ]);

    expect(checkEnvExample({ exampleKeys, ...real })).toEqual({
      ok: false,
      problems: ['`NEXT_PUBLIC_SMTP_PASSWORD` expone un secreto al navegador (CA-19, CA-29)'],
    });
  });
});
