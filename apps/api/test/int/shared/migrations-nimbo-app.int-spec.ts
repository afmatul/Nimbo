import { DataSource } from 'typeorm';
import type { QueryRunner } from 'typeorm';

import { ConcederPermisosNimboApp20260928110000 } from '../../../src/migrations/20260928110000-conceder-permisos-nimbo-app';
import { CrearFuncionesDeActor20260928110100 } from '../../../src/migrations/20260928110100-crear-funciones-de-actor';
import { PoliticasRlsArchivoVersionCarga20260930100300 } from '../../../src/migrations/20260930100300-politicas-rls-archivo-version-carga';
import { RlsCarpetaYPurgaDePapelera20261001100200 } from '../../../src/migrations/20261001100200-rls-carpeta-y-purga-de-papelera';
import { CrearAccesoRapido20261003100000 } from '../../../src/migrations/20261003100000-crear-acceso-rapido';
import { CrearEventoAuditoria20261005100000 } from '../../../src/migrations/20261005100000-crear-evento-auditoria';
import { CrearSuscripcion20261014100000 } from '../../../src/migrations/20261014100000-crear-suscripcion';
import { CrearTransaccion20261014100100 } from '../../../src/migrations/20261014100100-crear-transaccion';
import { CrearFactura20261014170000 } from '../../../src/migrations/20261014170000-crear-factura';
import { EmisionDeFacturas20261015090000 } from '../../../src/migrations/20261015090000-emision-de-facturas';
import { AvisoDeFactura20261015100000 } from '../../../src/migrations/20261015100000-aviso-de-factura';
import { FuncionesDeLecturaDeSuscripcion20261015110000 } from '../../../src/migrations/20261015110000-funciones-de-lectura-de-suscripcion';
import { SuscripcionMenorPrivilegio20261017100000 } from '../../../src/migrations/20261017100000-suscripcion-menor-privilegio';
import { CrearSesionEdicionYParticipacion20261018100000 } from '../../../src/migrations/20261018100000-crear-sesion-edicion-y-participacion';
import { AgregarSesionEdicionAVersionArchivo20261018100100 } from '../../../src/migrations/20261018100100-agregar-sesion-edicion-a-version-archivo';
import { CrearIndexacionYFragmento20261022100000 } from '../../../src/migrations/20261022100000-crear-indexacion-y-fragmento';
import { CrearOptimizacion20261026110000 } from '../../../src/migrations/20261026110000-crear-optimizacion';
import { CrearUsoAgente20261028100000 } from '../../../src/migrations/20261028100000-crear-uso-agente';
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

/** Lectura del actor en SQL (plan §4 (c), DT-6): «actor sin fijar = NULL», base de las políticas de 005, 012 y 019. */
describe('migración crear-funciones-de-actor (CA-12)', () => {
  const ACTOR_ID = '6f1c2b1e-5d4a-4c3b-9a8f-7e6d5c4b3a21';
  let app: DataSource;

  const readActor = async (
    queryRunner: QueryRunner,
  ): Promise<{ id: string | null; role: string | null; tipo: string }> => {
    const [row] = (await queryRunner.query(
      'SELECT nimbo_actor_id() AS id, nimbo_actor_role() AS role, pg_typeof(nimbo_actor_id())::text AS tipo',
    )) as { id: string | null; role: string | null; tipo: string }[];
    if (row === undefined) throw new Error('La consulta del actor no devolvió filas');
    return row;
  };

  const inAppTransaction = async <T>(
    work: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> => {
    const queryRunner = app.createQueryRunner();
    await queryRunner.startTransaction();
    try {
      return await work(queryRunner);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  };

  /**
   * Fija el actor como lo hará `withActor` (T-29), pero a mano: esta prueba verifica las funciones SQL por sí
   * solas, sin depender del runner. Es la única excepción a `rls.js` fuera de `typeorm-transaction-runner.ts`.
   */
  const setActor = (queryRunner: QueryRunner, id: string, role: string): Promise<unknown> =>
    queryRunner.query(
      // eslint-disable-next-line no-restricted-syntax -- prueba de las funciones SQL sin el runner (ver arriba)
      'SELECT set_config($1, $2, true), set_config($3, $4, true)',
      ['app.actor_id', id, 'app.actor_role', role],
    );

  beforeAll(async () => {
    app = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_URL'] ?? '' }),
    ).initialize();
  });

  afterAll(async () => {
    await app.destroy();
  });

  it('CA-12: como nimbo_app y sin fijar nada, `nimbo_actor_id()` y `nimbo_actor_role()` son NULL', async () => {
    const actor = await inAppTransaction(readActor);

    expect(actor).toEqual({ id: null, role: null, tipo: 'uuid' });
  });

  it('CA-12: tras fijar el actor local a la transacción devuelven el actor, y el id es `uuid`', async () => {
    const actor = await inAppTransaction(async (queryRunner) => {
      await setActor(queryRunner, ACTOR_ID, 'CLIENT');
      return readActor(queryRunner);
    });

    expect(actor).toEqual({ id: ACTOR_ID, role: 'CLIENT', tipo: 'uuid' });
  });

  it('CA-12: con valores vacíos devuelven NULL (no fallan al convertir a `uuid`)', async () => {
    const actor = await inAppTransaction(async (queryRunner) => {
      await setActor(queryRunner, '', '');
      return readActor(queryRunner);
    });

    expect(actor).toEqual({ id: null, role: null, tipo: 'uuid' });
  });

  it('CA-12: el `down` elimina las dos funciones', async () => {
    const migration = new CrearFuncionesDeActor20260928110100();
    /** Las políticas RLS de 020, 021, 019, 016, 009, 004, 006 y 005 usan las funciones: se revierten antes, como en un `migration:revert` en orden. */
    const dependents = [
      new CrearUsoAgente20261028100000(),
      new CrearOptimizacion20261026110000(),
      new CrearIndexacionYFragmento20261022100000(),
      new AgregarSesionEdicionAVersionArchivo20261018100100(),
      new CrearSesionEdicionYParticipacion20261018100000(),
      new SuscripcionMenorPrivilegio20261017100000(),
      new FuncionesDeLecturaDeSuscripcion20261015110000(),
      new AvisoDeFactura20261015100000(),
      new EmisionDeFacturas20261015090000(),
      new CrearFactura20261014170000(),
      new CrearTransaccion20261014100100(),
      new CrearSuscripcion20261014100000(),
      new CrearEventoAuditoria20261005100000(),
      new CrearAccesoRapido20261003100000(),
      new RlsCarpetaYPurgaDePapelera20261001100200(),
      new PoliticasRlsArchivoVersionCarga20260930100300(),
    ];
    const owner = await new DataSource(
      buildDataSourceOptions({ DATABASE_URL: process.env['DATABASE_MIGRATION_URL'] ?? '' }),
    ).initialize();
    const queryRunner = owner.createQueryRunner();
    await queryRunner.startTransaction();
    try {
      for (const dependent of dependents) {
        await dependent.down(queryRunner);
      }
      await migration.down(queryRunner);

      const [row] = (await queryRunner.query(
        "SELECT to_regprocedure('nimbo_actor_id()') AS id, to_regprocedure('nimbo_actor_role()') AS role",
      )) as { id: string | null; role: string | null }[];
      expect(row).toEqual({ id: null, role: null });
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      await owner.destroy();
    }
  });
});
