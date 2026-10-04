import type { DataSource, EntityManager } from 'typeorm';

import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import {
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  insertUpload,
} from '../int/storage/storage-test-db';
import type { UploadRowOptions } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { RESTRICTED_OWNER_ROLE, startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

const HOUR_MS = 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * HOUR_MS;
/** Tope fijo de `carga_expiradas` (ADR-0021). */
const FUNCTION_CAP = 1000;
const FUNCTION_SIGNATURE = 'carga_expiradas(timestamptz, integer)';
/** Tope fijo de `papelera_vencida` (006 plan §3), el mismo que el de `carga_expiradas`. */
const TRASH_FUNCTION_CAP = 1000;
const TRASH_FUNCTION_SIGNATURE = 'papelera_vencida(timestamptz, integer)';
/** Columnas que `papelera_vencida` puede devolver: sin nombres, rutas ni claves de objeto. */
const TRASH_FUNCTION_COLUMNS = ['id', 'propietario_id', 'tipo_nodo'];

interface OwnerRole {
  readonly owner: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

/**
 * Sin esto la suite pasaría en vacío (ADR-0021 §2, plan R-10): un superusuario ignora RLS incluso con `FORCE` y la
 * política `carga_mantenimiento` sería inerte.
 */
const assertRestrictedOwner = async (owner: DataSource): Promise<void> => {
  const [row] = (await owner.query(
    `SELECT r.rolname AS owner, r.rolsuper, r.rolbypassrls
       FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
      WHERE c.oid = 'public.carga'::regclass`,
  )) as OwnerRole[];
  if (row === undefined || row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `storage-maintenance no puede correr: el dueño de \`carga\` (${row?.owner ?? 'desconocido'}) es ` +
        'superusuario o tiene BYPASSRLS, y la prueba pasaría en vacío. Migra con un rol NOSUPERUSER (ADR-0021).',
    );
  }
};

/**
 * DF-52 / ADR-0021 con un dueño `NOSUPERUSER` (plan §8): la única capacidad sin actor es `carga_expiradas`, que
 * devuelve solo `(id, propietario_id)` de cargas activas **vencidas**, con tope, y que `PUBLIC` no puede ejecutar.
 * Las *fixtures* de `carga` se insertan como `nimbo_app` dentro de `withActor` (D-18): el dueño no tiene política de
 * `INSERT`.
 */
describe('mantenimiento sin actor bajo RLS con dueño NOSUPERUSER (CA-9, DF-52, ADR-0021)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let ana: Actor;
  let bulk: Actor;
  const uploads = { expired: '', current: '', completed: '', cancelled: '' };

  const insertAs = (actor: Actor, options: UploadRowOptions = {}): Promise<string> =>
    transactions.withActor(actor, () =>
      insertUpload(context.requireActorScope(actor), actor.id, options),
    );

  const expiredFor = async (now: Date, limit: number): Promise<Record<string, unknown>[]> =>
    (await app.query('SELECT * FROM carga_expiradas($1, $2)', [now, limit])) as Record<
      string,
      unknown
    >[];

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    await assertRestrictedOwner(owner);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    ana = createActor(await insertAccount(owner), Role.CLIENT);
    bulk = createActor(await insertAccount(owner), Role.CLIENT);
    const past = new Date(Date.now() - HOUR_MS);
    uploads.expired = await insertAs(ana, { expiresAt: past });
    uploads.current = await insertAs(ana);
    uploads.completed = await insertAs(ana, { state: 'completada', expiresAt: past });
    uploads.cancelled = await insertAs(ana, { state: 'cancelada', expiresAt: past });
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('DF-52: el dueño de `carga` es el rol restringido, sin superusuario ni BYPASSRLS', async () => {
    const [row] = (await owner.query(
      `SELECT r.rolname AS owner, r.rolsuper, r.rolbypassrls
         FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = 'public.carga'::regclass`,
    )) as OwnerRole[];

    expect(row).toEqual({ owner: RESTRICTED_OWNER_ROLE, rolsuper: false, rolbypassrls: false });
  });

  it('CA-16: `nimbo_app` sin actor ve 0 filas de `carga` por consulta directa', async () => {
    const [row] = (await app.query('SELECT count(*)::int AS n FROM carga')) as { n: number }[];

    expect(row?.n).toBe(0);
  });

  it('DF-52: `FORCE` somete al dueño: por consulta directa solo ve cargas activas (`carga_mantenimiento`)', async () => {
    const rows = (await owner.query('SELECT id FROM carga WHERE propietario_id = $1', [
      ana.id,
    ])) as { id: string }[];

    expect(rows.map((row) => row.id).sort()).toEqual([uploads.expired, uploads.current].sort());
  });

  it('CA-9: `carga_expiradas` devuelve solo `(id, propietario_id)` de las activas vencidas', async () => {
    const rows = await expiredFor(new Date(), FUNCTION_CAP);

    expect(rows.filter((row) => row['propietario_id'] === ana.id)).toEqual([
      { id: uploads.expired, propietario_id: ana.id },
    ]);
  });

  it('DF-52: no devuelve cargas vigentes aunque `p_ahora` sea dentro de un año', async () => {
    const rows = await expiredFor(new Date(Date.now() + YEAR_MS), FUNCTION_CAP);

    expect(rows.map((row) => row['id'])).not.toContain(uploads.current);
  });

  it('DF-52: no expone cargas `completada` ni `cancelada` aunque estén vencidas', async () => {
    const ids = (await expiredFor(new Date(), FUNCTION_CAP)).map((row) => row['id']);

    expect(ids).not.toContain(uploads.completed);
    expect(ids).not.toContain(uploads.cancelled);
  });

  it('DF-52: devuelve como máximo 1000 filas aunque se pidan más', async () => {
    await transactions.withActor(bulk, () =>
      context.requireActorScope(bulk).query(
        `INSERT INTO carga (id, propietario_id, nombre, tamano_bytes, modo, archivo_id, version_id, clave_objeto,
                            expira_en, creada_en, actualizada_en)
         SELECT gen_random_uuid(), $1::uuid, 'x.pdf', 1, 'simple', gen_random_uuid(), gen_random_uuid(),
                'u/' || $1::text || '/' || n, now() - interval '1 hour', now(), now()
           FROM generate_series(1, $2::int) AS n`,
        [bulk.id, FUNCTION_CAP + 1],
      ),
    );

    await expect(expiredFor(new Date(), FUNCTION_CAP * 5)).resolves.toHaveLength(FUNCTION_CAP);
  });

  it('DF-52: `PUBLIC` no puede ejecutarla; `nimbo_app` sí', async () => {
    const [row] = (await owner.query(
      `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
              has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
      [FUNCTION_SIGNATURE],
    )) as { public: boolean; app: boolean }[];

    expect(row).toEqual({ public: false, app: true });
  });

  it('DF-52: `pg_policies` y `pg_proc` muestran que la política y la función son del dueño de `carga`', async () => {
    const [row] = (await owner.query(
      `SELECT (SELECT roles::text[] FROM pg_policies
                WHERE tablename = 'carga' AND policyname = 'carga_mantenimiento') AS policy_roles,
              (SELECT cmd FROM pg_policies
                WHERE tablename = 'carga' AND policyname = 'carga_mantenimiento') AS policy_cmd,
              (SELECT proowner::regrole::text FROM pg_proc WHERE oid = $1::regprocedure) AS function_owner,
              (SELECT prosecdef FROM pg_proc WHERE oid = $1::regprocedure) AS security_definer,
              (SELECT tableowner::text FROM pg_tables WHERE tablename = 'carga') AS table_owner`,
      [FUNCTION_SIGNATURE],
    )) as Record<string, unknown>[];

    expect(row).toEqual({
      policy_roles: [RESTRICTED_OWNER_ROLE],
      policy_cmd: 'SELECT',
      function_owner: RESTRICTED_OWNER_ROLE,
      security_definer: true,
      table_owner: RESTRICTED_OWNER_ROLE,
    });
  });

  /**
   * 006 CA-19, CA-22 (DF-52, ADR-0021): `papelera_vencida` es la única lectura sin actor de la purga. Devuelve solo
   * `(tipo_nodo, id, propietario_id)` de las **raíces** de la papelera **vencidas**, con tope; nunca filas vivas, ni
   * no vencidas, ni lo que arrastró una carpeta. Las *fixtures* se insertan como `nimbo_app` dentro de `withActor`.
   */
  describe('purga de la papelera sin actor (006 CA-19, CA-22)', () => {
    let carla: Actor;
    let bulkTrash: Actor;
    const trash = {
      expiredFile: '',
      expiredFolder: '',
      carriedFile: '',
      pendingFile: '',
      pendingFolder: '',
      liveFile: '',
      liveFolder: '',
    };

    const asCarla = <T>(work: (scope: EntityManager) => Promise<T>): Promise<T> =>
      transactions.withActor(carla, () => work(context.requireActorScope(carla)));

    const trashDueFor = async (now: Date, limit: number): Promise<Record<string, unknown>[]> =>
      (await app.query('SELECT * FROM papelera_vencida($1, $2)', [now, limit])) as Record<
        string,
        unknown
      >[];

    const carlaIdsDue = async (now: Date): Promise<unknown[]> =>
      (await trashDueFor(now, TRASH_FUNCTION_CAP))
        .filter((row) => row['propietario_id'] === carla.id)
        .map((row) => row['id']);

    beforeAll(async () => {
      carla = createActor(await insertAccount(owner), Role.CLIENT);
      bulkTrash = createActor(await insertAccount(owner), Role.CLIENT);
      const deletedAt = new Date(Date.now() - 2 * HOUR_MS);
      const due = { deletedAt, purgeAt: new Date(Date.now() - HOUR_MS) };
      const pending = { deletedAt, purgeAt: new Date(Date.now() + HOUR_MS) };
      await asCarla(async (scope) => {
        trash.expiredFile = (await insertFileWithVersion(scope, carla.id, due)).fileId;
        const expiredFolder = await insertFolder(scope, carla.id, due);
        trash.expiredFolder = expiredFolder.id;
        trash.carriedFile = (
          await insertFileWithVersion(scope, carla.id, {
            ...due,
            folderId: expiredFolder.id,
            trashedWithFolderId: expiredFolder.id,
          })
        ).fileId;
        trash.pendingFile = (await insertFileWithVersion(scope, carla.id, pending)).fileId;
        trash.pendingFolder = (await insertFolder(scope, carla.id, pending)).id;
        trash.liveFile = (await insertFileWithVersion(scope, carla.id)).fileId;
        trash.liveFolder = (await insertFolder(scope, carla.id)).id;
      });
    });

    it('CA-22: `nimbo_app` sin actor ve 0 filas de `carpeta` por consulta directa', async () => {
      const [row] = (await app.query('SELECT count(*)::int AS n FROM carpeta')) as { n: number }[];

      expect(row?.n).toBe(0);
    });

    it('DF-52: `FORCE` somete al dueño: por consulta directa solo ve carpetas y archivos en la papelera', async () => {
      const visible = async (table: 'carpeta' | 'archivo'): Promise<string[]> =>
        (
          (await owner.query(`SELECT id FROM ${table} WHERE propietario_id = $1`, [carla.id])) as {
            id: string;
          }[]
        )
          .map((row) => row.id)
          .sort();

      await expect(visible('carpeta')).resolves.toEqual(
        [trash.expiredFolder, trash.pendingFolder].sort(),
      );
      await expect(visible('archivo')).resolves.toEqual(
        [trash.expiredFile, trash.carriedFile, trash.pendingFile].sort(),
      );
    });

    it('CA-19: devuelve solo `(tipo_nodo, id, propietario_id)` de las raíces vencidas, sin nombres ni claves', async () => {
      const rows = (await trashDueFor(new Date(), TRASH_FUNCTION_CAP)).filter(
        (row) => row['propietario_id'] === carla.id,
      );

      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          { tipo_nodo: 'archivo', id: trash.expiredFile, propietario_id: carla.id },
          { tipo_nodo: 'carpeta', id: trash.expiredFolder, propietario_id: carla.id },
        ]),
      );
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(TRASH_FUNCTION_COLUMNS);
    });

    it('DF-52: no devuelve filas vivas ni lo que arrastró una carpeta', async () => {
      const ids = await carlaIdsDue(new Date());

      expect(ids).not.toContain(trash.liveFile);
      expect(ids).not.toContain(trash.liveFolder);
      expect(ids).not.toContain(trash.carriedFile);
    });

    it('DF-52: no devuelve lo no vencido aunque `p_ahora` sea dentro de un año', async () => {
      const ids = await carlaIdsDue(new Date(Date.now() + YEAR_MS));

      expect(ids).not.toContain(trash.pendingFile);
      expect(ids).not.toContain(trash.pendingFolder);
    });

    it('DF-52: devuelve como máximo 1000 filas aunque se pidan más', async () => {
      await transactions.withActor(bulkTrash, () =>
        context.requireActorScope(bulkTrash).query(
          `INSERT INTO carpeta (id, propietario_id, nombre, ruta, profundidad, creado_en, actualizado_en,
                                eliminado_en, purgar_en)
           SELECT g.id, $1::uuid, 'x' || g.n, '/' || g.id || '/', 1, now(), now(),
                  now() - interval '2 hours', now() - interval '1 hour'
             FROM (SELECT gen_random_uuid() AS id, n FROM generate_series(1, $2::int) AS n) AS g`,
          [bulkTrash.id, TRASH_FUNCTION_CAP + 1],
        ),
      );

      await expect(trashDueFor(new Date(), TRASH_FUNCTION_CAP * 5)).resolves.toHaveLength(
        TRASH_FUNCTION_CAP,
      );
    });

    it('DF-52: `PUBLIC` no puede ejecutar `papelera_vencida`; `nimbo_app` sí', async () => {
      const [row] = (await owner.query(
        `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
                has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
        [TRASH_FUNCTION_SIGNATURE],
      )) as { public: boolean; app: boolean }[];

      expect(row).toEqual({ public: false, app: true });
    });

    it('DF-52: las políticas de mantenimiento y la función son del dueño de las tablas', async () => {
      const [row] = (await owner.query(
        `SELECT (SELECT array_agg(DISTINCT r ORDER BY r) FROM pg_policies, unnest(roles::text[]) r
                  WHERE policyname IN ('archivo_mantenimiento', 'carpeta_mantenimiento')) AS policy_roles,
                (SELECT array_agg(DISTINCT cmd) FROM pg_policies
                  WHERE policyname IN ('archivo_mantenimiento', 'carpeta_mantenimiento')) AS policy_cmds,
                (SELECT proowner::regrole::text FROM pg_proc WHERE oid = $1::regprocedure) AS function_owner,
                (SELECT prosecdef FROM pg_proc WHERE oid = $1::regprocedure) AS security_definer,
                (SELECT tableowner::text FROM pg_tables WHERE tablename = 'carpeta') AS table_owner`,
        [TRASH_FUNCTION_SIGNATURE],
      )) as Record<string, unknown>[];

      expect(row).toEqual({
        policy_roles: [RESTRICTED_OWNER_ROLE],
        policy_cmds: ['SELECT'],
        function_owner: RESTRICTED_OWNER_ROLE,
        security_definer: true,
        table_owner: RESTRICTED_OWNER_ROLE,
      });
    });
  });
});
