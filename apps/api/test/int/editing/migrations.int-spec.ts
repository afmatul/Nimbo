import { randomUUID } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

import { CrearSesionEdicionYParticipacion20261018100000 } from '../../../src/migrations/20261018100000-crear-sesion-edicion-y-participacion';
import { AgregarSesionEdicionAVersionArchivo20261018100100 } from '../../../src/migrations/20261018100100-agregar-sesion-edicion-a-version-archivo';
import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  columnsOf,
  connectAsAppDatabase,
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  removeAccounts,
} from '../storage/storage-test-db';

import { insertEditSession, insertParticipation } from './editing-test-db';
import type { EditedFileRow, EditSessionRowOptions } from './editing-test-db';

/**
 * Migraciones de 016 (plan §3) sobre el Postgres del arnés, como el dueño de las tablas. Los casos de esquema corren
 * en una transacción que se revierte; los de RLS confirman *fixtures* como `nimbo_app` dentro de `withActor`.
 */
const sessions = new CrearSesionEdicionYParticipacion20261018100000();
const versionLink = new AgregarSesionEdicionAVersionArchivo20261018100100();

let owner: DataSource;

beforeAll(async () => {
  owner = await connectAsOwner();
});

afterAll(async () => {
  await owner.destroy();
});

const editedFile = async (runner: QueryRunner): Promise<EditedFileRow> => {
  const ownerId = await insertAccount(runner);
  return { ownerId, ...(await insertFileWithVersion(runner, ownerId)) };
};

/** Versión 2 del archivo con el origen y la sesión pedidos. */
const insertVersion = async (
  runner: QueryRunner,
  file: EditedFileRow,
  link: { origin: string; sessionId: string | null; number?: number },
): Promise<void> => {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero,
                                  sesion_edicion_id)
     VALUES ($1, $2, $3, $4, 2048, $5, now(), $6, $7)`,
    [
      id,
      file.fileId,
      link.origin,
      `u/${file.ownerId}/${file.fileId}/${id}`,
      file.ownerId,
      link.number ?? 2,
      link.sessionId,
    ],
  );
};

const rejectsSession = (options: EditSessionRowOptions, constraint: RegExp): Promise<void> =>
  expect(
    inRolledBackTransaction(owner, async (runner) => {
      await insertEditSession(runner, await editedFile(runner), options);
    }),
  ).rejects.toThrow(constraint);

describe('migración crear-sesion-edicion-y-participacion (plan 016 §3)', () => {
  it('CA-14: `sesion_edicion` guarda archivo, propietaria, quién abrió, versión base, estado, motivo y fechas', async () => {
    const columns = await inRolledBackTransaction(owner, (runner) =>
      columnsOf(runner, 'sesion_edicion'),
    );

    expect(Object.keys(columns).sort()).toEqual(
      [
        'abierta_por',
        'archivo_id',
        'estado',
        'finalizada_en',
        'id',
        'iniciada_en',
        'motivo_fallo',
        'propietario_id',
        'version_base_id',
      ].sort(),
    );
    expect(columns['motivo_fallo']?.nullable).toBe(true);
    expect(columns['finalizada_en']?.nullable).toBe(true);
  });

  it('CA-14: `archivo_id` y `version_base_id` no son FK: la purga no borra la evidencia de una sesión fallida (DF-70)', async () => {
    const rows = (await owner.query(
      `SELECT a.attname AS columna FROM pg_constraint k
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
        WHERE k.conrelid = 'sesion_edicion'::regclass AND k.contype = 'f' ORDER BY a.attname`,
    )) as { columna: string }[];

    expect(rows.map((row) => row.columna)).toEqual(['abierta_por', 'propietario_id']);
  });

  it('CA-9: una sesión `activa` sin motivo y una `fallida` con motivo son válidas', async () => {
    const states = await inRolledBackTransaction(owner, async (runner) => {
      const file = await editedFile(runner);
      await insertEditSession(runner, file, { state: 'cerrada' });
      await insertEditSession(runner, file, { state: 'fallida', failure: 'integridad' });
      await insertEditSession(runner, file);
      return (await runner.query(
        'SELECT estado FROM sesion_edicion WHERE archivo_id = $1 ORDER BY estado',
        [file.fileId],
      )) as { estado: string }[];
    });

    expect(states.map((row) => row.estado)).toEqual(['activa', 'cerrada', 'fallida']);
  });

  it.each<[string, EditSessionRowOptions]>([
    ['una `fallida` sin motivo', { state: 'fallida', failure: null }],
    ['una `cerrada` con motivo', { state: 'cerrada', failure: 'editor' }],
  ])('CA-14: el CHECK de motivo rechaza %s', async (_case, options) => {
    await rejectsSession(options, /check constraint/);
  });

  it.each<[string, EditSessionRowOptions]>([
    ['un estado desconocido', { state: 'pausada' }],
    ['un motivo desconocido', { state: 'fallida', failure: 'cansancio' }],
  ])('CA-14: rechaza %s', async (_case, options) => {
    await rejectsSession(options, /check constraint/);
  });

  it.each(['activa', 'guardando'] as const)(
    'CA-9: un archivo no tiene dos sesiones abiertas (`uq_sesion_edicion_abierta`, segunda `%s`)',
    async (second) => {
      await expect(
        inRolledBackTransaction(owner, async (runner) => {
          const file = await editedFile(runner);
          await insertEditSession(runner, file);
          await insertEditSession(runner, file, { state: second });
        }),
      ).rejects.toThrow(/uq_sesion_edicion_abierta/);
    },
  );

  it('CA-9: la participación es única por sesión y cuenta, y cae con su sesión', async () => {
    const [duplicate, afterDelete] = await inRolledBackTransaction(owner, async (runner) => {
      const file = await editedFile(runner);
      const sessionId = await insertEditSession(runner, file);
      await insertParticipation(runner, sessionId, file.ownerId);
      await runner.query('SAVEPOINT repetida');
      const error = await insertParticipation(runner, sessionId, file.ownerId).catch(
        (caught: unknown) => caught,
      );
      await runner.query('ROLLBACK TO SAVEPOINT repetida');
      await runner.query('DELETE FROM sesion_edicion WHERE id = $1', [sessionId]);
      const [left] = (await runner.query(
        'SELECT count(*)::int AS n FROM participacion WHERE sesion_edicion_id = $1',
        [sessionId],
      )) as { n: number }[];
      return [error, left?.n];
    });

    expect(String(duplicate)).toMatch(/participacion_pkey/);
    expect(afterDelete).toBe(0);
  });
});

describe('migración agregar-sesion-edicion-a-version-archivo (plan 016 §3)', () => {
  it('CA-10: dos versiones no comparten sesión (`uq_version_archivo_sesion_edicion`, DF-05)', async () => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const file = await editedFile(runner);
        const sessionId = await insertEditSession(runner, file, { state: 'cerrada' });
        await insertVersion(runner, file, { origin: 'edicion', sessionId });
        await insertVersion(runner, file, { origin: 'edicion', sessionId, number: 3 });
      }),
    ).rejects.toThrow(/uq_version_archivo_sesion_edicion/);
  });

  it.each([
    ['una versión de edición sin sesión', 'edicion', false],
    ['una carga con sesión', 'carga', true],
  ])('CA-9: `ck_version_archivo_sesion_origen` rechaza %s', async (_case, origin, linked) => {
    await expect(
      inRolledBackTransaction(owner, async (runner) => {
        const file = await editedFile(runner);
        const sessionId = await insertEditSession(runner, file, { state: 'cerrada' });
        await insertVersion(runner, file, { origin, sessionId: linked ? sessionId : null });
      }),
    ).rejects.toThrow(/ck_version_archivo_sesion_origen/);
  });

  it('CA-9: una versión de edición con su sesión es válida', async () => {
    const [row] = await inRolledBackTransaction(owner, async (runner) => {
      const file = await editedFile(runner);
      const sessionId = await insertEditSession(runner, file, { state: 'cerrada' });
      await insertVersion(runner, file, { origin: 'edicion', sessionId });
      return (await runner.query(
        'SELECT origen, sesion_edicion_id = $2 AS enlazada FROM version_archivo WHERE archivo_id = $1 AND numero = 2',
        [file.fileId, sessionId],
      )) as { origen: string; enlazada: boolean }[];
    });

    expect(row).toEqual({ origen: 'edicion', enlazada: true });
  });

  it('RNF-10: `down` y `up` de las dos migraciones en orden inverso dejan el mismo esquema', async () => {
    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await versionLink.down(runner);
      await sessions.down(runner);
      const down = await editingSchemaOf(runner);
      await sessions.up(runner);
      await versionLink.up(runner);
      return [down, await editingSchemaOf(runner)];
    });

    expect(afterDown).toEqual({ tables: [], column: null, constraints: [] });
    expect(afterUp).toEqual({
      tables: ['participacion', 'sesion_edicion'],
      column: 'sesion_edicion_id',
      constraints: [
        'ck_version_archivo_sesion_origen',
        'fk_version_archivo_sesion_edicion',
        'uq_version_archivo_sesion_edicion',
      ],
    });
  });
});

describe('RLS de `sesion_edicion` y `participacion` (plan 016 §3, RNF-05)', () => {
  let app: AppDatabase;
  let ana: Actor;
  let bruno: Actor;
  const internals = {} as Record<Role.ADMIN | Role.SUPPORT | Role.OPERATOR, Actor>;
  const created: string[] = [];

  const visible = (actor: Actor, table: 'sesion_edicion' | 'participacion'): Promise<number> =>
    app.asActor(actor, async (manager) => {
      const [row] = (await manager.query(`SELECT count(*)::int AS n FROM ${table}`)) as {
        n: number;
      }[];
      return row?.n ?? 0;
    });

  beforeAll(async () => {
    app = await connectAsAppDatabase();
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
      admin: await insertAccount(manager, Role.ADMIN),
      support: await insertAccount(manager, Role.SUPPORT),
      operator: await insertAccount(manager, Role.OPERATOR),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
    internals[Role.ADMIN] = createActor(accounts.admin, Role.ADMIN);
    internals[Role.SUPPORT] = createActor(accounts.support, Role.SUPPORT);
    internals[Role.OPERATOR] = createActor(accounts.operator, Role.OPERATOR);
    await app.asActor(ana, async (manager) => {
      const file = { ownerId: ana.id, ...(await insertFileWithVersion(manager, ana.id)) };
      await insertParticipation(manager, await insertEditSession(manager, file), ana.id);
    });
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
  });

  /** La de 016 para la propietaria y las del Editor de 012 (plan 012 §3, PD-108); ninguna para roles internos. */
  const POLICIES_OF: Record<string, { policyname: string; cmd: string }[]> = {
    sesion_edicion: [
      { policyname: 'sesion_edicion_cliente', cmd: 'ALL' },
      { policyname: 'sesion_edicion_compartida', cmd: 'SELECT' },
      { policyname: 'sesion_edicion_compartida_alta', cmd: 'INSERT' },
      { policyname: 'sesion_edicion_compartida_bloqueo', cmd: 'UPDATE' },
    ],
    participacion: [
      { policyname: 'participacion_cliente', cmd: 'ALL' },
      { policyname: 'participacion_compartida', cmd: 'SELECT' },
      { policyname: 'participacion_compartida_alta', cmd: 'INSERT' },
      { policyname: 'participacion_compartida_cambio', cmd: 'UPDATE' },
    ],
  };

  it.each(['sesion_edicion', 'participacion'])(
    'RNF-05: `%s` tiene RLS habilitada y forzada, con la política de cliente y las del Editor de 012',
    async (table) => {
      const [rls] = (await owner.query(
        'SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = $1::regclass',
        [table],
      )) as { enabled: boolean; forced: boolean }[];
      const policies = (await owner.query(
        'SELECT policyname, cmd FROM pg_policies WHERE tablename = $1 ORDER BY policyname',
        [table],
      )) as { policyname: string; cmd: string }[];

      expect(rls).toEqual({ enabled: true, forced: true });
      expect(policies).toEqual(POLICIES_OF[table]);
    },
  );

  it('RNF-05: la propietaria ve su sesión y su participación; otro cliente no ve nada', async () => {
    await expect(visible(ana, 'sesion_edicion')).resolves.toBe(1);
    await expect(visible(ana, 'participacion')).resolves.toBe(1);
    await expect(visible(bruno, 'sesion_edicion')).resolves.toBe(0);
    await expect(visible(bruno, 'participacion')).resolves.toBe(0);
  });

  it('RNF-05: un cliente no crea una sesión a nombre de otra cuenta (WITH CHECK)', async () => {
    await expect(
      app.asActor(bruno, async (manager) => {
        await insertEditSession(manager, {
          ownerId: ana.id,
          fileId: randomUUID(),
          versionId: randomUUID(),
        });
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR] as const)(
    'CA-17: %s no ve filas de `sesion_edicion` ni de `participacion`',
    async (role) => {
      await expect(visible(internals[role], 'sesion_edicion')).resolves.toBe(0);
      await expect(visible(internals[role], 'participacion')).resolves.toBe(0);
    },
  );

  it.each(['sesion_edicion', 'participacion'])(
    'RNF-05: `nimbo_app` sin actor no ve filas de `%s`',
    async (table) => {
      const [row] = (await app.dataSource.query(`SELECT count(*)::int AS n FROM ${table}`)) as {
        n: number;
      }[];

      expect(row?.n).toBe(0);
    },
  );
});

/** Lo que crean las dos migraciones: tablas, la columna de `version_archivo` y sus restricciones. */
async function editingSchemaOf(
  runner: QueryRunner,
): Promise<{ tables: string[]; column: string | null; constraints: string[] }> {
  const tables = (await runner.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('sesion_edicion', 'participacion') ORDER BY table_name`,
  )) as { table_name: string }[];
  const [column] = (await runner.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'version_archivo' AND column_name = 'sesion_edicion_id'`,
  )) as { column_name: string }[];
  const constraints = (await runner.query(
    `SELECT conname::text AS name FROM pg_constraint
      WHERE conrelid = 'version_archivo'::regclass AND conname LIKE '%sesion%' ORDER BY conname`,
  )) as { name: string }[];
  return {
    tables: tables.map((row) => row.table_name),
    column: column?.column_name ?? null,
    constraints: constraints.map((row) => row.name),
  };
}
