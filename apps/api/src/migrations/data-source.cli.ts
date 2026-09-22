import { DataSource } from 'typeorm';

import { apiEnvSchema, buildDataSourceOptions, loadDotenvFile, loadEnv } from '../shared';

/** Lanza si el entorno es inválido: la CLI y `migrate.ts` no deben arrancar a medias (CA-18). */
const requireEnv = (): { DATABASE_URL: string } => {
  const result = loadEnv(apiEnvSchema.pick({ DATABASE_URL: true }));
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
export const AppDataSource = new DataSource(buildDataSourceOptions(requireEnv()));
