import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../src/shared';
import {
  APP_ROLE_SCRIPT_SOURCE,
  APP_ROLE_SCRIPT_TARGET,
  POSTGRES_IMAGE,
} from '../../int/setup/containers';
import { runMigrations } from '../../int/setup/migrate';

/** Rol dueño **sin** superusuario (ADR-0021 §2): con él, `FORCE` RLS y `carga_mantenimiento` no son inertes. */
export const RESTRICTED_OWNER_ROLE = 'nimbo_dueno_restringido';
const RESTRICTED_OWNER_PASSWORD = 'nimbo_dueno_restringido';
const DATABASE_NAME = 'nimbo_mantenimiento';
const APP_DB_ROLE = 'nimbo_app';
const APP_DB_PASSWORD = 'nimbo_app';

/** Postgres propio de la suite de mantenimiento, migrado por un dueño `NOSUPERUSER`. */
export interface RestrictedOwnerDatabase {
  /** URL del dueño restringido (el que migró y es dueño de `carga` y de `carga_expiradas`). */
  readonly ownerUrl: string;
  /** URL de `nimbo_app` (sin `BYPASSRLS`, no dueño): la de `api` y `worker`. */
  readonly appUrl: string;
  stop(): Promise<void>;
}

const withCredentials = (
  url: string,
  user: string,
  password: string,
  database = DATABASE_NAME,
): string => {
  const next = new URL(url);
  next.username = user;
  next.password = password;
  next.pathname = `/${database}`;
  return next.toString();
};

/** Corre `statements` como el superusuario del contenedor sobre `database`, y cierra la conexión. */
const runAsSuperuser = async (
  container: StartedPostgreSqlContainer,
  database: string,
  statements: readonly string[],
): Promise<void> => {
  const url = withCredentials(
    container.getConnectionUri(),
    container.getUsername(),
    container.getPassword(),
    database,
  );
  const dataSource = await new DataSource(
    buildDataSourceOptions({ DATABASE_URL: url }),
  ).initialize();
  try {
    for (const statement of statements) await dataSource.query(statement);
  } finally {
    await dataSource.destroy();
  }
};

/**
 * Arranque de la suite `storage-maintenance` (plan §8, DF-52): un contenedor propio (el del arnés compartido migra con
 * el superusuario). Como superusuario, solo lo que exige serlo: el rol dueño `NOSUPERUSER`, la base a su nombre y
 * `CREATE EXTENSION vector`; `nimbo_app` lo crea el mismo script que usa `compose.yml`. Después migra **con el dueño
 * restringido**, así la política `carga_mantenimiento` queda atada a ese rol (`TO CURRENT_USER`).
 */
export const startRestrictedOwnerDatabase = async (): Promise<RestrictedOwnerDatabase> => {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withCopyFilesToContainer([{ source: APP_ROLE_SCRIPT_SOURCE, target: APP_ROLE_SCRIPT_TARGET }])
    .withEnvironment({ NIMBO_APP_DB_PASSWORD: APP_DB_PASSWORD })
    .start();
  await runAsSuperuser(container, container.getDatabase(), [
    `CREATE ROLE ${RESTRICTED_OWNER_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
       PASSWORD '${RESTRICTED_OWNER_PASSWORD}'`,
    `CREATE DATABASE ${DATABASE_NAME} OWNER ${RESTRICTED_OWNER_ROLE}`,
  ]);
  await runAsSuperuser(container, DATABASE_NAME, ['CREATE EXTENSION IF NOT EXISTS vector']);
  const base = container.getConnectionUri();
  const ownerUrl = withCredentials(base, RESTRICTED_OWNER_ROLE, RESTRICTED_OWNER_PASSWORD);
  runMigrations(ownerUrl);
  return {
    ownerUrl,
    appUrl: withCredentials(base, APP_DB_ROLE, APP_DB_PASSWORD),
    stop: async () => {
      await container.stop();
    },
  };
};
