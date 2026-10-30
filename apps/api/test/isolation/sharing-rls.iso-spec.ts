import { randomUUID } from 'node:crypto';

import type { DataSource, EntityManager } from 'typeorm';

import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { insertChunk, insertIndexing } from '../int/intelligence/intelligence-test-db';
import type { IndexedVersionRow } from '../int/intelligence/intelligence-test-db';
import { insertShare } from '../int/sharing/sharing-test-db';
import type { SharedNode } from '../int/sharing/sharing-test-db';
import { insertAccount, insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';
import type { FolderRow, Queryable } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { INTERNAL_ROLES } from './setup/isolation-assertions';
import { RESTRICTED_OWNER_ROLE, startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

const RLS_ERROR = /row-level security/;
/** Clave de cada fila por tabla: `participacion` no tiene `id`. */
const ROW_KEYS = {
  archivo: 'id::text',
  carpeta: 'id::text',
  version_archivo: 'id::text',
  comparticion: 'id::text',
  fragmento: 'id::text',
  indexacion: 'id::text',
  sesion_edicion: 'id::text',
  participacion: "sesion_edicion_id::text || ':' || usuario_id::text",
} as const;
type ContentTable = keyof typeof ROW_KEYS;
const CONTENT_TABLES = Object.keys(ROW_KEYS) as ContentTable[];
/** Lo que ningún rol interno alcanza (`archivo`/`carpeta` tienen sus metadatos internos de 005/006). */
const INTERNAL_BLIND_TABLES: readonly ContentTable[] = CONTENT_TABLES.filter(
  (table) => table !== 'archivo' && table !== 'carpeta',
);

const INSERT_SESSION_SQL = `INSERT INTO sesion_edicion
    (id, archivo_id, propietario_id, abierta_por, version_base_id, estado, iniciada_en)
  VALUES ($1, $2, $3, $3, $4, 'activa', now())`;
const INSERT_EVENT_SQL = `INSERT INTO evento_auditoria
    (id, accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso, recurso_id, atributos, ocurrido_en)
  VALUES ($1, $2, nimbo_actor_id(), 'CLIENT', $3, $4, $5, $6::jsonb, $7)`;

/** Un archivo con su versión vigente indexada (fila de `indexacion` y un fragmento). */
interface IndexedFile extends IndexedVersionRow {
  readonly indexingId: string;
  readonly chunkId: string;
}

/**
 * Lo de A: `shared` (Lector para B) con `sub` y dos archivos; `direct` (Editor para B) con una versión antigua y una
 * sesión abierta; `editorFolder` (Editor para B, vacía); y lo no compartido (`unshared`, con su sesión).
 */
interface WorldOfA {
  readonly shared: FolderRow;
  readonly sub: FolderRow;
  readonly editorFolder: FolderRow;
  readonly inSub: IndexedFile;
  readonly inFolder: IndexedVersionRow;
  readonly direct: IndexedVersionRow & { readonly oldVersionId: string };
  readonly unshared: IndexedFile;
  readonly sessions: {
    readonly direct: string;
    readonly inFolder: string;
    readonly unshared: string;
  };
  readonly shareIds: readonly string[];
}

const indexedFile = async (m: Queryable, ownerId: string, folderId: string | null = null) => {
  const version = await insertFileWithVersion(m, ownerId, { folderId });
  return {
    ...version,
    indexingId: await insertIndexing(m, version, { state: 'indexado' }),
    chunkId: await insertChunk(m, version),
  };
};

/** Segunda versión vigente: la de `insertFileWithVersion` queda como antigua. */
const withNewVersion = async (m: Queryable, ownerId: string, fileId: string): Promise<string> => {
  const current = randomUUID();
  await m.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
     VALUES ($1, $2, 'carga', $3, 1024, $4, now(), 2)`,
    [current, fileId, `u/${ownerId}/${fileId}/${current}`, ownerId],
  );
  await m.query('UPDATE archivo SET version_actual_id = $2 WHERE id = $1', [fileId, current]);
  return current;
};

/** Sesión `activa` de la propietaria, con su participación. */
const openSession = async (m: Queryable, ownerId: string, file: IndexedVersionRow) => {
  const id = randomUUID();
  await m.query(INSERT_SESSION_SQL, [id, file.fileId, ownerId, file.versionId]);
  await m.query(
    'INSERT INTO participacion (sesion_edicion_id, usuario_id, entro_en) VALUES ($1, $2, now())',
    [id, ownerId],
  );
  return id;
};

const seedNodesOfA = async (m: Queryable, a: string) => {
  const shared = await insertFolder(m, a, { name: 'Proyecto' });
  const sub = await insertFolder(m, a, { name: 'Anexos', parent: shared });
  const direct = await insertFileWithVersion(m, a);
  const versionId = await withNewVersion(m, a, direct.fileId);
  return {
    shared,
    sub,
    editorFolder: await insertFolder(m, a, { name: 'Borradores' }),
    inSub: await indexedFile(m, a, sub.id),
    inFolder: await insertFileWithVersion(m, a, { folderId: shared.id }),
    direct: { fileId: direct.fileId, versionId, oldVersionId: direct.versionId },
    unshared: await indexedFile(m, a),
  };
};

/** Siembra el mundo de A **como A** (`nimbo_app` en `withActor`): con dueño `NOSUPERUSER`, `FORCE` aplica al dueño. */
const seedWorldOfA = async (m: Queryable, a: string, b: string): Promise<WorldOfA> => {
  const nodes = await seedNodesOfA(m, a);
  const share = (node: SharedNode, level: string) =>
    insertShare(m, { ownerId: a, granteeId: b, node, level });
  const shareIds = [
    await share({ folderId: nodes.shared.id }, 'VIEWER'),
    await share({ fileId: nodes.direct.fileId }, 'EDITOR'),
    await share({ folderId: nodes.editorFolder.id }, 'EDITOR'),
  ];
  const sessions = {
    direct: await openSession(m, a, nodes.direct),
    inFolder: await openSession(m, a, nodes.inFolder),
    unshared: await openSession(m, a, nodes.unshared),
  };
  return { ...nodes, sessions, shareIds };
};

const sortedKeys = (keys: readonly string[]): string[] => [...keys].sort();

/** Lo que B debe ver, tabla por tabla, sin filtro en la consulta: lo suyo más lo compartido vigente. */
const expectedForB = (
  w: WorldOfA,
  own: IndexedFile,
  ownerId: string,
): Record<ContentTable, string[]> => ({
  archivo: [own.fileId, w.inSub.fileId, w.inFolder.fileId, w.direct.fileId],
  carpeta: [w.shared.id, w.sub.id, w.editorFolder.id],
  version_archivo: [own.versionId, w.inSub.versionId, w.inFolder.versionId, w.direct.versionId],
  comparticion: [...w.shareIds],
  fragmento: [own.chunkId, w.inSub.chunkId],
  indexacion: [own.indexingId, w.inSub.indexingId],
  sesion_edicion: [w.sessions.direct],
  participacion: [`${w.sessions.direct}:${ownerId}`],
});

/**
 * RLS de compartición sin filtro en la consulta (spec 012 CA-20, CA-21; plan §3, R-4) con un dueño **sin**
 * `SUPERUSER` (ADR-0021): así `SECURITY DEFINER` de `nodos_compartidos()` queda sometido a `FORCE` y a sus políticas
 * `TO CURRENT_USER`, como en producción. Todo se escribe como `nimbo_app` dentro de `withActor`; las cuentas, como el
 * dueño. Los riesgos que reportaron los developers (T-09, T-11) van al final; los que hoy no se cumplen están marcados
 * con `it.failing` y documentados en `review.md` (Seguridad).
 */
describe('RLS de compartición con dueño NOSUPERUSER (012 CA-21, CA-20; plan R-4)', () => {
  let database: Awaited<ReturnType<typeof startRestrictedOwnerDatabase>>;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let a: Actor;
  let b: Actor;
  let c: Actor;
  let world: WorldOfA;
  let ownOfB: IndexedFile;
  let ownOfC: IndexedVersionRow;

  const asActor = <T>(actor: Actor, work: (m: EntityManager) => Promise<T>): Promise<T> =>
    transactions.withActor(actor, () => work(context.requireActorScope(actor)));

  /** Corre `work` como `actor` y revierte siempre: los intentos no dejan filas aunque la base los acepte. */
  const attemptAs = async <T>(actor: Actor, work: (m: EntityManager) => Promise<T>): Promise<T> => {
    const rollback = new Error('rollback');
    let result: T | undefined;
    try {
      await asActor(actor, async (m) => {
        result = await work(m);
        throw rollback;
      });
    } catch (error: unknown) {
      if (error !== rollback) throw error;
    }
    return result as T;
  };

  const newActor = async (role: Role = Role.CLIENT): Promise<Actor> =>
    createActor(await insertAccount(owner, role), role);

  const visibleKeys = (actor: Actor, table: ContentTable): Promise<string[]> =>
    asActor(actor, async (m) => {
      const rows = (await m.query(`SELECT ${ROW_KEYS[table]} AS k FROM ${table}`)) as {
        k: string;
      }[];
      return sortedKeys(rows.map((row) => row.k));
    });

  /** Filas que cambió una escritura (`RETURNING` dentro de un CTE: el driver devuelve las filas). */
  const changedIds = async (
    m: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<string[]> => {
    const rows = (await m.query(
      `WITH cambio AS (${sql} RETURNING id) SELECT id FROM cambio`,
      params,
    )) as {
      id: string;
    }[];
    return rows.map((row) => row.id);
  };

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    [a, b, c] = [await newActor(), await newActor(), await newActor()];
    world = await asActor(a, (m) => seedWorldOfA(m, a.id, b.id));
    ownOfB = await asActor(b, (m) => indexedFile(m, b.id));
    ownOfC = await asActor(c, (m) => insertFileWithVersion(m, c.id));
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  describe('CA-21: SELECT sin WHERE como `nimbo_app`', () => {
    it.each(CONTENT_TABLES)(
      'ISO-15: B no puede leer de `%s` más que lo suyo y lo que A le compartió',
      async (table) => {
        const expected = expectedForB(world, ownOfB, a.id);

        expect(await visibleKeys(b, table)).toEqual(sortedKeys(expected[table]));
      },
    );

    it.each(CONTENT_TABLES)('ISO-16: C no puede leer de `%s` nada de A ni de B', async (table) => {
      const own: Record<ContentTable, string[]> = {
        archivo: [ownOfC.fileId],
        version_archivo: [ownOfC.versionId],
        carpeta: [],
        comparticion: [],
        fragmento: [],
        indexacion: [],
        sesion_edicion: [],
        participacion: [],
      };

      expect(await visibleKeys(c, table)).toEqual(own[table]);
    });

    it.each(CONTENT_TABLES)('ISO-17: A no puede leer de `%s` nada de B', async (table) => {
      const ofB = [ownOfB.fileId, ownOfB.versionId, ownOfB.chunkId, ownOfB.indexingId];

      expect((await visibleKeys(a, table)).filter((key) => ofB.includes(key))).toEqual([]);
    });

    it('ISO-18: B no puede leer la versión antigua del archivo compartido ni lo no compartido', async () => {
      const versions = await visibleKeys(b, 'version_archivo');
      const files = await visibleKeys(b, 'archivo');

      expect(versions).not.toContain(world.direct.oldVersionId);
      expect(files).not.toContain(world.unshared.fileId);
    });

    it('ISO-19 (CA-17): con A suspendida, B no puede leer nada de A sin filtro', async () => {
      const onlyOwn: Partial<Record<ContentTable, string[]>> = {
        archivo: [ownOfB.fileId],
        carpeta: [],
        version_archivo: [ownOfB.versionId],
        fragmento: [ownOfB.chunkId],
        indexacion: [ownOfB.indexingId],
        sesion_edicion: [],
      };
      await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [a.id]);
      try {
        for (const [table, keys] of Object.entries(onlyOwn)) {
          const visible = await visibleKeys(b, table as ContentTable);
          expect({ table, visible }).toEqual({ table, visible: sortedKeys(keys) });
        }
      } finally {
        await owner.query("UPDATE usuario SET estado = 'activa' WHERE id = $1", [a.id]);
      }
    });
  });

  describe('CA-20 y `nodos_compartidos()`', () => {
    const sharedNodesOf = (actor: Actor) =>
      asActor(actor, (m) =>
        m.query('SELECT nodo_id, tipo_nodo, nivel FROM nodos_compartidos() ORDER BY nodo_id'),
      );

    it.each(INTERNAL_ROLES)(
      'ISO-20: %s no puede obtener filas de `nodos_compartidos()` ni de las tablas de contenido',
      async (role) => {
        const internal = await newActor(role);

        expect(await sharedNodesOf(internal)).toEqual([]);
        for (const table of INTERNAL_BLIND_TABLES) {
          expect({ table, keys: await visibleKeys(internal, table) }).toEqual({ table, keys: [] });
        }
      },
    );

    it('ISO-21: `nodos_compartidos()` solo responde por el actor de la transacción', async () => {
      const levels = {
        [world.shared.id]: 'VIEWER',
        [world.sub.id]: 'VIEWER',
        [world.inSub.fileId]: 'VIEWER',
        [world.inFolder.fileId]: 'VIEWER',
        [world.direct.fileId]: 'EDITOR',
        [world.editorFolder.id]: 'EDITOR',
      };
      const ofB = (await sharedNodesOf(b)) as { nodo_id: string; nivel: string }[];

      expect(Object.fromEntries(ofB.map((row) => [row.nodo_id, row.nivel]))).toEqual(levels);
      expect(await sharedNodesOf(c)).toEqual([]);
      expect(await sharedNodesOf(a)).toEqual([]);
      expect(await app.query('SELECT * FROM nodos_compartidos()')).toEqual([]);
      expect(await app.query('SELECT id FROM comparticion')).toEqual([]);
    });

    it('ISO-22: nadie puede pedir `nodos_compartidos()` de otra cuenta: no tiene parámetros', async () => {
      const [fn] = (await owner.query(
        `SELECT p.pronargs, p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) AS dueno
           FROM pg_proc p WHERE p.proname = 'nodos_compartidos'`,
      )) as unknown[];

      expect(fn).toEqual({
        pronargs: 0,
        prosecdef: true,
        provolatile: 's',
        proconfig: ['search_path=pg_catalog, pg_temp'],
        dueno: RESTRICTED_OWNER_ROLE,
      });
      await expect(
        asActor(c, (m) => m.query('SELECT * FROM nodos_compartidos($1::uuid)', [b.id])),
      ).rejects.toThrow(/does not exist/);
    });

    it('ISO-23: PUBLIC no puede ejecutar `nodos_compartidos()` y `nimbo_app` no puede sombrear funciones', async () => {
      const grantees = (await owner.query(
        `SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS rol, x.privilege_type
           FROM pg_proc p, aclexplode(p.proacl) x WHERE p.proname = 'nodos_compartidos' ORDER BY 1`,
      )) as unknown[];
      const [schema] = (await owner.query(
        `SELECT has_schema_privilege('nimbo_app', 'public', 'CREATE') AS crear,
                has_function_privilege('nimbo_app', 'nodos_compartidos()', 'EXECUTE') AS ejecutar`,
      )) as unknown[];

      expect(grantees).toEqual(
        [
          { rol: 'nimbo_app', privilege_type: 'EXECUTE' },
          { rol: RESTRICTED_OWNER_ROLE, privilege_type: 'EXECUTE' },
        ].sort((x, y) => x.rol.localeCompare(y.rol)),
      );
      expect(schema).toEqual({ crear: false, ejecutar: true });
    });

    it('ISO-24: las políticas del dueño para `nodos_compartidos()` son solo `SELECT`, `TO` el dueño y acotadas al actor', async () => {
      const policies = (await owner.query(
        `SELECT tablename, cmd, roles::text[] AS roles, qual LIKE '%nimbo_actor_id()%' AS acotada
           FROM pg_policies WHERE policyname LIKE '%\_nodos\_compartidos' ORDER BY tablename`,
      )) as unknown[];

      expect(policies).toEqual(
        ['archivo', 'carpeta', 'comparticion'].map((tablename) => ({
          tablename,
          cmd: 'SELECT',
          roles: [RESTRICTED_OWNER_ROLE],
          acotada: true,
        })),
      );
    });
  });

  describe('CA-14 por SQL: el destinatario no escribe lo ajeno', () => {
    it('ISO-25: B (Editor) no puede renombrar ni borrar el archivo de A', async () => {
      const id = world.direct.fileId;

      const renamed = await attemptAs(b, (m) =>
        changedIds(m, "UPDATE archivo SET nombre = 'x.pdf' WHERE id = $1", [id]),
      );
      const deleted = await attemptAs(b, (m) =>
        changedIds(m, 'DELETE FROM archivo WHERE id = $1', [id]),
      );

      expect({ renamed, deleted }).toEqual({ renamed: [], deleted: [] });
    });

    it('ISO-26: B (Editor) no puede crear versiones, índices ni fragmentos en lo de A', async () => {
      const attempts: ((m: EntityManager) => Promise<unknown>)[] = [
        (m) => withNewVersion(m, b.id, world.direct.fileId),
        (m) => insertIndexing(m, world.direct),
        (m) => insertChunk(m, world.inSub),
      ];
      for (const attempt of attempts) {
        await expect(attemptAs(b, attempt)).rejects.toThrow(RLS_ERROR);
      }
    });

    it('ISO-27: B no puede subir su nivel, compartir a nombre de A ni recompartir lo de A', async () => {
      const raised = await attemptAs(b, (m) =>
        changedIds(m, "UPDATE comparticion SET nivel = 'EDITOR' WHERE id = $1", [
          world.shareIds[0],
        ]),
      );
      const forged = [
        { ownerId: a.id, granteeId: c.id, node: { folderId: world.shared.id } },
        { ownerId: b.id, granteeId: c.id, node: { fileId: world.direct.fileId } },
        { ownerId: b.id, granteeId: c.id, node: { folderId: world.sub.id } },
      ];

      expect(raised).toEqual([]);
      for (const share of forged) {
        await expect(attemptAs(b, (m) => insertShare(m, share))).rejects.toThrow(RLS_ERROR);
      }
    });

    it('ISO-28: B no puede tocar la sesión de un archivo donde es Lector ni borrar la del Editor', async () => {
      const { inFolder, direct, unshared } = world.sessions;
      const sql =
        "UPDATE sesion_edicion SET estado = 'cerrada', finalizada_en = now() WHERE id = $1";

      const asViewer = await attemptAs(b, (m) => changedIds(m, sql, [inFolder]));
      const unrelated = await attemptAs(b, (m) => changedIds(m, sql, [unshared]));
      const deleted = await attemptAs(b, (m) =>
        changedIds(m, 'DELETE FROM sesion_edicion WHERE id = $1', [direct]),
      );

      expect({ asViewer, unrelated, deleted }).toEqual({
        asViewer: [],
        unrelated: [],
        deleted: [],
      });
    });
  });

  describe('riesgos reportados por los developers (T-09, T-11)', () => {
    it('ISO-29 (SEC-1): B no puede colgar un archivo propio de la carpeta compartida de A', async () => {
      await expect(
        attemptAs(b, (m) => insertFileWithVersion(m, b.id, { folderId: world.shared.id })),
      ).rejects.toThrow(/fk_archivo_carpeta_propietario/);
    });

    it('ISO-30 (SEC-1): B no puede colgar una carpeta propia de la carpeta compartida de A', async () => {
      await expect(
        attemptAs(b, (m) => insertFolder(m, b.id, { parent: world.shared })),
      ).rejects.toThrow(/fk_carpeta_padre_propietario/);
    });

    it('ISO-31 (SEC-1): B no puede impedir que A purgue su carpeta atando a ella un archivo propio', async () => {
      const planting = attemptAs(b, (m) =>
        insertFileWithVersion(m, b.id, {
          deletedAt: new Date(),
          trashedWithFolderId: world.editorFolder.id,
        }),
      );
      await expect(planting).rejects.toThrow(/fk_archivo_eliminado_con_propietario/);

      const purged = await attemptAs(a, (m) =>
        changedIds(m, 'DELETE FROM carpeta WHERE id = $1', [world.editorFolder.id]),
      );

      expect(purged).toEqual([world.editorFolder.id]);
    });

    it('ISO-32 (SEC-2): B (Editor) no puede cambiar por SQL el estado de la sesión de A', async () => {
      await expect(
        attemptAs(b, (m) =>
          changedIds(
            m,
            `UPDATE sesion_edicion SET estado = 'fallida', motivo_fallo = 'editor', finalizada_en = now()
            WHERE id = $1`,
            [world.sessions.direct],
          ),
        ),
      ).rejects.toThrow(RLS_ERROR);
    });

    it('ISO-33 (SEC-2): B (Editor) no puede quedarse por SQL con la sesión de A', async () => {
      await expect(
        attemptAs(b, (m) =>
          changedIds(m, 'UPDATE sesion_edicion SET propietario_id = $2 WHERE id = $1', [
            world.sessions.direct,
            b.id,
          ]),
        ),
      ).rejects.toThrow(RLS_ERROR);
    });

    it('ISO-38 (SEC-2): B (Editor) no puede sumarse a la autoría de una sesión ya cerrada de A', async () => {
      const closed = randomUUID();
      await asActor(a, (m) =>
        m.query(
          `INSERT INTO sesion_edicion
             (id, archivo_id, propietario_id, abierta_por, version_base_id, estado, iniciada_en, finalizada_en)
           VALUES ($1, $2, $3, $3, $4, 'cerrada', now(), now())`,
          [closed, world.direct.fileId, a.id, world.direct.versionId],
        ),
      );
      try {
        await expect(
          attemptAs(b, (m) =>
            m.query(
              'INSERT INTO participacion (sesion_edicion_id, usuario_id, entro_en) VALUES ($1, $2, now())',
              [closed, b.id],
            ),
          ),
        ).rejects.toThrow(RLS_ERROR);
      } finally {
        await asActor(a, (m) => m.query('DELETE FROM sesion_edicion WHERE id = $1', [closed]));
      }
    });

    it('ISO-34 (SEC-4): B (Lector) y C no pueden abrir una sesión a su nombre sobre un archivo de A', async () => {
      for (const actor of [b, c]) {
        await expect(
          attemptAs(actor, (m) =>
            m.query(INSERT_SESSION_SQL, [
              randomUUID(),
              world.inSub.fileId,
              actor.id,
              world.inSub.versionId,
            ]),
          ),
        ).rejects.toThrow(RLS_ERROR);
      }
    });
  });

  describe('auditoría de Salir desde el aislamiento (T-11)', () => {
    const writeEventAs = (actor: Actor, event: Record<string, unknown>) =>
      attemptAs(actor, (m) =>
        m.query(INSERT_EVENT_SQL, [
          randomUUID(),
          event.action ?? 'share.revoked',
          event.target ?? a.id,
          event.type ?? 'folder',
          event.resource ?? world.shared.id,
          JSON.stringify(event.attributes ?? { nodeType: event.type ?? 'folder', level: 'VIEWER' }),
          event.at ?? new Date(),
        ]),
      );

    it('ISO-35: B no puede leer, cambiar ni borrar la actividad de A', async () => {
      const eventId = randomUUID();
      await asActor(a, (m) =>
        m.query(INSERT_EVENT_SQL, [
          eventId,
          'node.trashed',
          a.id,
          'folder',
          world.shared.id,
          JSON.stringify({ nodeType: 'folder', itemCount: 1 }),
          new Date(),
        ]),
      );
      const visible = await attemptAs(b, (m) => m.query('SELECT id FROM evento_auditoria'));

      expect(visible).not.toContainEqual({ id: eventId });
      for (const sql of [
        "UPDATE evento_auditoria SET accion = 'share.revoked' WHERE id = $1",
        'DELETE FROM evento_auditoria WHERE id = $1',
      ]) {
        await expect(attemptAs(b, (m) => m.query(sql, [eventId]))).rejects.toThrow(
          /permission denied/,
        );
      }
    });

    it('ISO-36: B no puede escribir en la actividad de A otra acción, sobre lo heredado o a nombre de otro', async () => {
      const forged: Record<string, unknown>[] = [
        { action: 'share.granted' },
        { action: 'share.level_changed' },
        { action: 'node.trashed' },
        { resource: world.sub.id },
        { type: 'file', resource: world.inSub.fileId },
        { type: 'file', resource: world.unshared.fileId },
        { target: c.id },
      ];
      for (const event of forged) {
        await expect(writeEventAs(b, event)).rejects.toThrow(RLS_ERROR);
      }
      await expect(writeEventAs(c, {})).rejects.toThrow(RLS_ERROR);
    });

    it.failing(
      'ISO-37 (SEC-3): B no puede escribir en la actividad de A un `share.revoked` con atributos y fecha falsos',
      async () => {
        const forged = {
          attributes: {
            nodeType: 'folder',
            level: 'EDITOR',
            nota: 'Llama al 555-0100 para reactivar',
          },
          at: new Date('2020-01-01T00:00:00.000Z'),
        };

        await expect(writeEventAs(b, forged)).rejects.toThrow(RLS_ERROR);
      },
    );
  });
});
