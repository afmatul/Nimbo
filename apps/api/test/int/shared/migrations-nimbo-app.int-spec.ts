import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { ConcederPermisosNimboApp20260928110000 } from '../../../src/migrations/20260928110000-conceder-permisos-nimbo-app';
import { buildDataSourceOptions } from '../../../src/shared';

const APP_ROLE = 'nimbo_app';
const MISSING_ROLE_MESSAGE = 'Falta el rol nimbo_app: ejecuta pnpm db:app-role';
const PRIVILEGED_ROLE_MESSAGE = 'nimbo_app no puede ser superusuario ni tener BYPASSRLS (ADR-0005)';

/**
 * Migraciones de 003 sobre el Postgres del arnés, como el dueño de las tablas (plan §4 (b)). `CREATE/ALTER ROLE`
 * son transaccionales: cada caso corre en una transacción que se revierte, así que el rol compartido no cambia.
 */
describe('migración conceder-permisos-nimbo-app (CA-13)', () => {
  const migration = new ConcederPermisosNimboApp20260928110000();
  let owner: DataSource;
  let runner: QueryRunner;

  const tablePrivilege = async (table: string, privilege: string): Promise<boolean> => {
    const [row] = (await runner.query('SELECT has_table_privilege($1, $2, $3) AS ok', [
      APP_ROLE,
      table,
      privilege,
    ])) as { ok: boolean }[];
    return row?.ok ?? false;
  };

  beforeAll(async () => {
    owner = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_MIGRATION_URL'] ?? '' }),
    ).initialize();
  });

  afterAll(async () => {
    await owner.destroy();
  });

  beforeEach(async () => {
    runner = owner.createQueryRunner();
    await runner.startTransaction();
  });

  afterEach(async () => {
    await runner.rollbackTransaction();
    await runner.release();
  });

  it('CA-13: sin el rol nimbo_app el `up` falla y pide ejecutar pnpm db:app-role', async () => {
    await runner.query(`ALTER ROLE ${APP_ROLE} RENAME TO nimbo_app_renombrado`);

    await expect(migration.up(runner)).rejects.toThrow(MISSING_ROLE_MESSAGE);
  });

  it('CA-13: si nimbo_app tiene BYPASSRLS el `up` falla con el mensaje de ADR-0005', async () => {
    await runner.query(`ALTER ROLE ${APP_ROLE} BYPASSRLS`);

    await expect(migration.up(runner)).rejects.toThrow(PRIVILEGED_ROLE_MESSAGE);
  });

  it('CA-13: si nimbo_app es superusuario el `up` también falla', async () => {
    await runner.query(`ALTER ROLE ${APP_ROLE} SUPERUSER`);

    await expect(migration.up(runner)).rejects.toThrow(PRIVILEGED_ROLE_MESSAGE);
  });

  it('CA-13: `down` retira los permisos y un nuevo `up` los devuelve sin error', async () => {
    await migration.down(runner);
    const afterDown = await tablePrivilege('usuario', 'SELECT');

    await migration.up(runner);

    expect(afterDown).toBe(false);
    await expect(tablePrivilege('usuario', 'SELECT')).resolves.toBe(true);
    await expect(tablePrivilege('usuario', 'DELETE')).resolves.toBe(false);
    await expect(tablePrivilege('migracion', 'SELECT')).resolves.toBe(false);
  });
});
