import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../src/shared';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { removeAccounts } from '../storage/storage-test-db';

/** Base nueva con todas las migraciones, como el dueño, para probar `down` → `up` sin tocar la base compartida. */
export interface FreshDatabase {
  readonly dataSource: DataSource;
  drop(): Promise<void>;
}

export const createFreshDatabase = async (prefix: string): Promise<FreshDatabase> => {
  const owner = await connectAsOwner();
  const name = `${prefix}_${String(process.pid)}_${String(Date.now())}`;
  await owner.query(`CREATE DATABASE ${name}`);
  const url = new URL(requiredEnv('DATABASE_MIGRATION_URL'));
  url.pathname = `/${name}`;
  const dataSource = await new DataSource(
    buildDataSourceOptions({ DATABASE_URL: url.toString() }),
  ).initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  return {
    dataSource,
    drop: async () => {
      await dataSource.destroy();
      await owner.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await owner.destroy();
    },
  };
};

/** Revierte `migration` y las posteriores (hay que revertir antes las que vinieron después) y devuelve sus nombres. */
export const revertFrom = async (fresh: DataSource, migration: string): Promise<string[]> => {
  const applied = (
    (await fresh.query('SELECT name FROM migracion ORDER BY id')) as { name: string }[]
  ).map((row) => row.name);
  const reverted = applied.slice(applied.indexOf(migration));
  for (const _ of reverted) {
    await fresh.undoLastMigration({ transaction: 'each' });
  }
  return reverted;
};

export const tableExists = async (database: DataSource, table: string): Promise<boolean> => {
  const [row] = (await database.query('SELECT to_regclass($1)::text AS tabla', [table])) as {
    tabla: string | null;
  }[];
  return row?.tabla !== null;
};

/** RLS habilitada y forzada, y las políticas de `table` con su comando, como las ve el dueño. */
export const rlsOf = async (
  owner: DataSource,
  table: string,
): Promise<{ forced: boolean; policies: { policyname: string; cmd: string }[] }> => {
  const [rls] = (await owner.query(
    'SELECT relrowsecurity AND relforcerowsecurity AS forced FROM pg_class WHERE oid = to_regclass($1)',
    [table],
  )) as { forced: boolean }[];
  const policies = (await owner.query(
    'SELECT policyname, cmd FROM pg_policies WHERE tablename = $1 ORDER BY policyname',
    [table],
  )) as { policyname: string; cmd: string }[];
  return { forced: rls?.forced === true, policies };
};

/**
 * Borra (como el dueño) las facturas, las transacciones y las cuentas de una suite, en ese orden: las dos tablas son
 * `RESTRICT` (RN-7), así que una cuenta con pagos no se borra sin quitarlos antes.
 */
export const removeBillingAccounts = async (
  owner: DataSource,
  accountIds: readonly string[],
): Promise<void> => {
  if (accountIds.length === 0) return;
  await owner.query('DELETE FROM factura WHERE usuario_id = ANY($1)', [accountIds]);
  await owner.query('DELETE FROM transaccion WHERE usuario_id = ANY($1)', [accountIds]);
  await removeAccounts(owner, accountIds);
};
