import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/shared';

/** Variable que el arnés compartido (`global-setup.ts`) define para las suites; falla si no está. */
export const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined) throw new Error(`El arnés no definió ${key}`);
  return value;
};

/** Conexión a `url` fuera de Nest (el llamador la cierra con `destroy()`). */
export const connectTo = (url: string): Promise<DataSource> =>
  new DataSource(buildDataSourceOptions({ DATABASE_URL: url })).initialize();

/** Conexión como el **dueño** de las tablas (`DATABASE_MIGRATION_URL`), para *fixtures* y comprobaciones de esquema. */
export const connectAsOwner = (): Promise<DataSource> =>
  connectTo(requiredEnv('DATABASE_MIGRATION_URL'));
