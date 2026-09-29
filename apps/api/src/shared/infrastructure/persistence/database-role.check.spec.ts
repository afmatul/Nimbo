import type { DataSource } from 'typeorm';

import { DATABASE_ROLE_REJECTED_MESSAGE, DatabaseRoleCheck } from './database-role.check';

interface RoleRow {
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
  readonly owns_tables: boolean;
}

const SAFE_ROLE: RoleRow = { rolsuper: false, rolbypassrls: false, owns_tables: false };

const fakeDataSource = (row: RoleRow): { dataSource: DataSource; query: jest.Mock } => {
  const query = jest.fn().mockResolvedValue([row]);
  return { dataSource: { query } as unknown as DataSource, query };
};

const fakeLogger = (): { fatal: jest.Mock } => ({ fatal: jest.fn() });

describe('DatabaseRoleCheck (CA-13, DT-4)', () => {
  it.each<[string, Partial<RoleRow>, Record<string, boolean>]>([
    ['superusuario', { rolsuper: true }, { superuser: true, bypassRls: false, ownsTables: false }],
    ['BYPASSRLS', { rolbypassrls: true }, { superuser: false, bypassRls: true, ownsTables: false }],
    [
      'dueño de tablas',
      { owns_tables: true },
      { superuser: false, bypassRls: false, ownsTables: true },
    ],
  ])(
    'CA-13: rol %s → registra `db.role_rejected` (fatal, solo booleanos) y lanza con la acción correctiva',
    async (_caso, flags, expectedLog) => {
      const { dataSource } = fakeDataSource({ ...SAFE_ROLE, ...flags });
      const logger = fakeLogger();
      const check = new DatabaseRoleCheck(dataSource, logger);

      await expect(check.onApplicationBootstrap()).rejects.toThrow(DATABASE_ROLE_REJECTED_MESSAGE);

      expect(logger.fatal).toHaveBeenCalledTimes(1);
      expect(logger.fatal).toHaveBeenCalledWith({ event: 'db.role_rejected', ...expectedLog });
    },
  );

  it('CA-13: el mensaje nombra `nimbo_app`, `DATABASE_URL` y `pnpm db:app-role`', () => {
    expect(DATABASE_ROLE_REJECTED_MESSAGE).toBe(
      'La API debe conectarse como nimbo_app; revisa DATABASE_URL y ejecuta pnpm db:app-role',
    );
  });

  it('CA-13: los tres en `false` → no registra ni lanza', async () => {
    const { dataSource, query } = fakeDataSource(SAFE_ROLE);
    const logger = fakeLogger();
    const check = new DatabaseRoleCheck(dataSource, logger);

    await expect(check.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(logger.fatal).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('CA-13: la propiedad de tablas incluye la heredada por pertenencia (`pg_has_role … USAGE`, plan §11.5 cambio 4)', async () => {
    const { dataSource, query } = fakeDataSource(SAFE_ROLE);
    const check = new DatabaseRoleCheck(dataSource, fakeLogger());

    await check.onApplicationBootstrap();

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("pg_has_role(r.oid, c.relowner, 'USAGE')");
    expect(sql).toContain('current_user');
  });
});
