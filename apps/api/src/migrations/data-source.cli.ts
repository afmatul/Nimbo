import { DataSource } from 'typeorm';

import { buildDataSourceOptions, loadDotenvFile, loadEnv } from '../shared';
import { migrationEnvSchema } from '../shared/infrastructure/config/env.schema';
import type { MigrationEnv } from '../shared/infrastructure/config/env.schema';

/**
 * Lanza si el entorno es inválido: la CLI y `migrate.ts` no deben arrancar a medias (CA-18). Las migraciones
 * corren como el dueño de las tablas (`DATABASE_MIGRATION_URL`), nunca como `nimbo_app` (003 CA-13, ADR-0005).
 */
const requireEnv = (): MigrationEnv => {
  const result = loadEnv(migrationEnvSchema);
  if (!result.ok) {
    throw new Error(`Configuración inválida: ${result.issues.join('; ')}`);
  }
  return result.env;
};

/**
 * Fuente de datos para la CLI de TypeORM (`-d src/migrations/data-source.cli.ts`) y `scripts/migrate.ts`.
 * Vive fuera de `shared` y no se reexporta: importar `shared` nunca lee el entorno (plan 000 §4).
 * Este archivo es el punto de entrada de ambos caminos, así que aquí se carga el `.env` de la raíz:
 * hacerlo en `migrate.ts` llegaría tarde, porque su `import` de este módulo se evalúa antes.
 */
loadDotenvFile();
export const AppDataSource = new DataSource(
  buildDataSourceOptions({ DATABASE_URL: requireEnv().DATABASE_MIGRATION_URL }),
);
