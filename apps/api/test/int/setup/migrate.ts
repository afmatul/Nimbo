import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const API_ROOT = resolve(__dirname, '../../..');
const MIGRATION_TIMEOUT_MS = 120_000;

/**
 * Aplica las migraciones versionadas sobre el Postgres de Testcontainers con el mismo camino que
 * `pnpm --filter api migration:run` (`tsx src/scripts/migrate.ts run`, una transacción por migración). Un proceso
 * aparte porque TypeORM carga las migraciones `.ts` por glob, y eso requiere `tsx`, no el transformador de Jest.
 * Lo usan `int` e `isolation` desde `global-setup.ts`; si una migración falla, la corrida no arranca.
 */
export function runMigrations(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    [require.resolve('tsx/cli'), 'src/scripts/migrate.ts', 'run'],
    {
      cwd: API_ROOT,
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      timeout: MIGRATION_TIMEOUT_MS,
    },
  );
  if (result.status !== 0) {
    throw new Error(`Las migraciones fallaron (salida ${String(result.status)}): ${result.stderr}`);
  }
}
