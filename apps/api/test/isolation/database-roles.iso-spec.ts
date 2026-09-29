import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { DataSource } from 'typeorm';

import { EnvModule, SharedModule } from '../../src/shared';
import { createLogSinkModule, LogSink } from '../int/setup/log-sink';
import type { LogLine } from '../int/setup/log-sink';
import { buildTestEnv } from '../int/setup/test-app';
import { connectAsOwner, connectTo, requiredEnv } from '../support/database-urls';

const APP_ROLE = 'nimbo_app';
/** Rol de prueba que hereda la propiedad de las tablas por pertenencia (plan §11.5 cambio 4). */
const HEIR_ROLE = 'nimbo_heredero_prueba';
const HEIR_PASSWORD = 'nimbo_heredero_prueba';
/** Nivel `fatal` de pino. */
const FATAL_LEVEL = 60;

type TablePrivileges = Record<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', boolean>;

const PRIVILEGES_SQL = `SELECT has_table_privilege($1, $2, 'SELECT') AS "SELECT",
        has_table_privilege($1, $2, 'INSERT') AS "INSERT",
        has_table_privilege($1, $2, 'UPDATE') AS "UPDATE",
        has_table_privilege($1, $2, 'DELETE') AS "DELETE"`;

const withCredentials = (url: string, user: string, password: string): string => {
  const next = new URL(url);
  next.username = user;
  next.password = password;
  return next.toString();
};

interface BootstrapOutcome {
  readonly error: unknown;
  readonly rejections: LogLine[];
}

/**
 * Un solo destino para todo el archivo: nestjs-pino conserva por proceso el logger raíz de la primera app que arranca,
 * así que las apps siguientes escriben en el destino de la primera.
 */
const logs = new LogSink();

/** Arranca `SharedModule` como `api` y `worker` (`init` corre `onApplicationBootstrap`) con otra `DATABASE_URL`. */
const bootstrapWith = async (databaseUrl: string): Promise<BootstrapOutcome> => {
  logs.clear();
  const moduleRef = await Test.createTestingModule({
    imports: [
      createLogSinkModule(logs),
      EnvModule.forRoot(buildTestEnv({ DATABASE_URL: databaseUrl })),
      SharedModule,
    ],
  }).compile();
  const nestApp: INestApplication = moduleRef.createNestApplication({ bufferLogs: true });
  let error: unknown;
  try {
    await nestApp.init();
  } catch (caught: unknown) {
    error = caught;
  } finally {
    await nestApp.close();
  }
  return { error, rejections: logs.lines().filter((line) => line.event === 'db.role_rejected') };
};

/**
 * Roles de base de datos del arnés compartido (003 CA-13, CA-15; plan §4, §6.4, §6.8): se migra como el dueño de las
 * tablas y la app se conecta como `nimbo_app`. Si una prueba se conectara como superusuario, pasaría aunque hubiera
 * fugas (ADR-0005).
 */
describe('roles de base de datos (CA-13)', () => {
  let owner: DataSource;
  let app: DataSource;
  let ownerName: string;

  const privilegesOf = async (table: string): Promise<TablePrivileges> => {
    const [row] = (await owner.query(PRIVILEGES_SQL, [APP_ROLE, table])) as [TablePrivileges];
    return row;
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectTo(requiredEnv('DATABASE_URL'));
    const [row] = (await owner.query('SELECT current_user AS usuario')) as [{ usuario: string }];
    ownerName = row.usuario;
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
  });

  it('CA-13: el arnés migra con `DATABASE_MIGRATION_URL`, que es el dueño de las tablas', async () => {
    const [row] = (await owner.query(
      `SELECT pg_get_userbyid(c.relowner) AS dueno
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'migracion'`,
    )) as { dueno: string }[];

    expect(row?.dueno).toBe(ownerName);
  });

  it('CA-13: el rol `nimbo_app` existe en el contenedor compartido y puede iniciar sesión', async () => {
    const rows = (await owner.query('SELECT rolcanlogin FROM pg_roles WHERE rolname = $1', [
      APP_ROLE,
    ])) as { rolcanlogin: boolean }[];

    expect(rows).toEqual([{ rolcanlogin: true }]);
  });

  it('CA-13: la conexión de la app es nimbo_app, sin superusuario ni BYPASSRLS, no es dueña de nada en `public` ni tiene CREATE', async () => {
    const [row] = (await app.query(
      `SELECT current_user AS usuario, r.rolsuper, r.rolbypassrls,
              EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE n.nspname = 'public' AND pg_has_role(r.oid, c.relowner, 'USAGE')) AS owns_tables,
              has_schema_privilege(current_user, 'public', 'CREATE') AS can_create
         FROM pg_roles r WHERE r.rolname = current_user`,
    )) as [Record<string, unknown>];

    expect(row).toEqual({
      usuario: APP_ROLE,
      rolsuper: false,
      rolbypassrls: false,
      owns_tables: false,
      can_create: false,
    });
  });

  it('CA-13: todas las tablas de `public` son del rol que migra', async () => {
    const rows = (await owner.query(
      `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public'`,
    )) as { tablename: string; tableowner: string }[];

    expect(rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining(['migracion', 'usuario', 'token_cuenta']),
    );
    expect(rows.filter((row) => row.tableowner !== ownerName)).toEqual([]);
  });

  it('CA-13: matriz de permisos — `usuario` y `token_cuenta` sin DELETE, `migracion` sin permisos', async () => {
    const withoutDelete: TablePrivileges = {
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: false,
    };
    const none: TablePrivileges = { SELECT: false, INSERT: false, UPDATE: false, DELETE: false };

    await expect(privilegesOf('usuario')).resolves.toEqual(withoutDelete);
    await expect(privilegesOf('token_cuenta')).resolves.toEqual(withoutDelete);
    await expect(privilegesOf('migracion')).resolves.toEqual(none);
  });

  it('CA-13: una tabla nueva del dueño recibe SELECT/INSERT/UPDATE/DELETE por privilegios por defecto', async () => {
    const runner = owner.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query('CREATE TABLE tabla_nueva_prueba (id int)');
      const [row] = (await runner.query(PRIVILEGES_SQL, [APP_ROLE, 'tabla_nueva_prueba'])) as [
        TablePrivileges,
      ];

      expect(row).toEqual({ SELECT: true, INSERT: true, UPDATE: true, DELETE: true });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('CA-13: con `DATABASE_URL` de nimbo_app la app arranca sin `db.role_rejected`', async () => {
    const outcome = await bootstrapWith(requiredEnv('DATABASE_URL'));

    expect(outcome.error).toBeUndefined();
    expect(outcome.rejections).toEqual([]);
  });

  it('CA-13: con `DATABASE_URL` del dueño la app no arranca y registra `db.role_rejected` (fatal, sin URL)', async () => {
    const outcome = await bootstrapWith(requiredEnv('DATABASE_MIGRATION_URL'));

    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toContain('pnpm db:app-role');
    expect(outcome.rejections).toEqual([
      expect.objectContaining({ level: FATAL_LEVEL, ownsTables: true }),
    ]);
    expect(JSON.stringify(outcome.rejections)).not.toContain('postgres://');
  });

  describe('rol que hereda la propiedad por pertenencia (`GRANT <dueño> TO <rol>`)', () => {
    beforeAll(async () => {
      await owner.query(
        `CREATE ROLE ${HEIR_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${HEIR_PASSWORD}'`,
      );
      await owner.query(`GRANT "${ownerName}" TO ${HEIR_ROLE}`);
    });

    afterAll(async () => {
      await owner.query(`DROP ROLE IF EXISTS ${HEIR_ROLE}`);
    });

    it('CA-13: también se rechaza, con `ownsTables: true` y sin superusuario ni BYPASSRLS propios', async () => {
      const heirUrl = withCredentials(requiredEnv('DATABASE_URL'), HEIR_ROLE, HEIR_PASSWORD);

      const outcome = await bootstrapWith(heirUrl);

      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.rejections).toEqual([
        expect.objectContaining({
          event: 'db.role_rejected',
          superuser: false,
          bypassRls: false,
          ownsTables: true,
        }),
      ]);
    });
  });
});
