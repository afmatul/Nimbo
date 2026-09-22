import { join } from 'node:path';

import type { DataSourceOptions } from 'typeorm';

import type { Env } from '../config/env.schema';

const MIGRATIONS_TABLE = 'migracion';
/** Solo archivos con marca de tiempo: `data-source.cli.ts` vive en la misma carpeta y no es una migración. */
const MIGRATION_FILES = '[0-9]*.{ts,js}';

/**
 * Opciones de TypeORM, función pura sin efectos al importar (plan 000 §4). `synchronize` es literal `false`
 * (CA-10, RN-3): todo cambio de esquema es una migración versionada. `AppDataSource` vive en
 * `migrations/data-source.cli.ts` y no se reexporta; Nest usa `TypeOrmModule.forRootAsync` con estas opciones.
 */
export function buildDataSourceOptions(env: Pick<Env, 'DATABASE_URL'>): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    synchronize: false,
    migrationsTableName: MIGRATIONS_TABLE,
    migrations: [join(__dirname, '../../../migrations', MIGRATION_FILES)],
    entities: [
      join(__dirname, '../../../modules/**/infrastructure/persistence/*.orm-entity.{ts,js}'),
    ],
    logging: false,
  };
}
