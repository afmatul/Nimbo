import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import { SoporteRestauraLaPapelera20261026100100 } from '../../../src/migrations/20261026100100-soporte-restaura-la-papelera';
import { FileName } from '../../../src/modules/storage/domain/file-name.vo';
import { FolderName } from '../../../src/modules/storage/domain/folder-name.vo';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import {
  RESTRICTED_OWNER_ROLE,
  startRestrictedOwnerDatabase,
} from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectTo } from '../../support/database-urls';

import {
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
} from './storage-test-db';
import type { FileRowOptions, FolderRow, FolderRowOptions } from './storage-test-db';

const FUNCTION_SIGNATURE = 'restaurar_raiz_papelera(uuid, text, uuid, integer)';
const MAX_DEPTH = 10;
const DAY_MS = 86_400_000;

/** En la papelera desde hace un día y con retención vigente. */
const IN_FORCE = {
  deletedAt: new Date(Date.now() - DAY_MS),
  purgeAt: new Date(Date.now() + 29 * DAY_MS),
};

/** Políticas del dueño y función de la migración: lo que el `down` debe quitar y el `up` volver a poner. */
const SCHEMA_SQL = `SELECT
  (SELECT json_agg(json_build_array(p.policyname, p.tablename, p.cmd, p.roles::text, p.qual, p.with_check)
                   ORDER BY p.policyname)
     FROM pg_policies p WHERE p.policyname LIKE '%\\_soporte\\_%') AS politicas,
  (SELECT json_agg(json_build_array(f.provolatile, f.prosecdef, f.proconfig))
     FROM pg_proc f WHERE f.proname = 'restaurar_raiz_papelera') AS funciones`;

interface Schema {
  readonly politicas: [string, string, string, string, string, string | null][] | null;
  readonly funciones: [string, boolean, string[]][] | null;
}

/** Lee el esquema en `db`: dentro de la transacción de la prueba, el DDL todavía no confirmado se ve. */
const schemaIn = async (db: DataSource | QueryRunner): Promise<Schema> =>
  ((await db.query(SCHEMA_SQL)) as Schema[])[0] as Schema;

interface RestoreRow {
  readonly resultado: string;
  readonly nombre_original: string;
  readonly elementos: number;
  readonly bytes: string;
}

/** Una llamada a la función: dueño, tipo y nodo; sin `maxDepth`, la de `.env.example`. */
interface RestoreCall {
  readonly ownerId: string;
  readonly type: string;
  readonly nodeId: string;
  readonly maxDepth?: number;
}

interface NodeRow {
  readonly nombre: string;
  readonly padre: string | null;
  readonly ruta: string | null;
  readonly profundidad: number | null;
  readonly eliminado_en: Date | null;
  readonly purgar_en: Date | null;
  readonly eliminado_con_carpeta_id: string | null;
}

/**
 * `restaurar_raiz_papelera` (spec 011b CA-11, CA-12; plan §3; ADR-0035) con un dueño **sin** `SUPERUSER`: bajo
 * `FORCE` RLS, sin las políticas `*_soporte_*` la función no podría leer el destino ni sacar filas de la papelera.
 * Las *fixtures* se insertan como el cliente (`nimbo_app`): el dueño no tiene política de `INSERT`.
 */
describe('papelera de Soporte: `restaurar_raiz_papelera` con dueño NOSUPERUSER (011b plan §3)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let runner: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let support: Actor;

  const as = <T>(actor: Actor, work: (manager: EntityManager) => Promise<T>): Promise<T> =>
    runner.withActor(actor, () => work(context.requireActorScope(actor)));

  const newClient = async (): Promise<Actor> =>
    createActor(await insertAccount(owner, Role.CLIENT), Role.CLIENT);

  const file = async (client: Actor, options: FileRowOptions = {}): Promise<string> =>
    (await as(client, (manager) => insertFileWithVersion(manager, client.id, options))).fileId;

  const folder = (client: Actor, options: FolderRowOptions = {}): Promise<FolderRow> =>
    as(client, (manager) => insertFolder(manager, client.id, options));

  const restoreAs = (actor: Actor, call: RestoreCall): Promise<RestoreRow[]> =>
    as(actor, (manager) =>
      manager.query('SELECT * FROM restaurar_raiz_papelera($1, $2, $3, $4)', [
        call.ownerId,
        call.type,
        call.nodeId,
        call.maxDepth ?? MAX_DEPTH,
      ]),
    ) as Promise<RestoreRow[]>;

  const restore = (call: RestoreCall): Promise<RestoreRow[]> => restoreAs(support, call);

  /** El nodo como lo ve su dueño (la política del cliente cubre lo vivo y lo eliminado). */
  const nodeOf = async (
    client: Actor,
    table: 'archivo' | 'carpeta',
    id: string,
  ): Promise<NodeRow> => {
    const columns =
      table === 'archivo'
        ? 'carpeta_id AS padre, NULL AS ruta, NULL AS profundidad'
        : 'carpeta_padre_id AS padre, ruta, profundidad';
    const [row] = (await as(client, (manager) =>
      manager.query(
        `SELECT nombre, ${columns}, eliminado_en, purgar_en, eliminado_con_carpeta_id FROM ${table} WHERE id = $1`,
        [id],
      ),
    )) as NodeRow[];
    return row as NodeRow;
  };

  const schemaOf = (db: DataSource | QueryRunner = owner): Promise<Schema> => schemaIn(db);

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    runner = new TypeOrmTransactionRunner(app, context);
    support = createActor(await insertAccount(owner, Role.SUPPORT), Role.SUPPORT);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  describe('esquema (plan §3, ADR-0035)', () => {
    it('el dueño que migra no es superusuario ni tiene BYPASSRLS (si no, la prueba pasaría en vacío)', async () => {
      const [role] = (await owner.query(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
      )) as { rolsuper: boolean; rolbypassrls: boolean }[];

      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it('cuatro políticas del dueño solo para SUPPORT y una función `VOLATILE` `SECURITY DEFINER` con `search_path` cerrado', async () => {
      const { politicas, funciones } = await schemaOf();
      const roles = `{${RESTRICTED_OWNER_ROLE}}`;
      const support = "(nimbo_actor_role() = 'SUPPORT'::text)";

      expect(
        politicas?.map(([name, table, cmd, policyRoles]) => [name, table, cmd, policyRoles]),
      ).toEqual([
        ['archivo_soporte_destino', 'archivo', 'SELECT', roles],
        ['archivo_soporte_restauracion', 'archivo', 'UPDATE', roles],
        ['carpeta_soporte_destino', 'carpeta', 'SELECT', roles],
        ['carpeta_soporte_restauracion', 'carpeta', 'UPDATE', roles],
      ]);
      expect(politicas?.map(([, , cmd, , , check]) => (cmd === 'UPDATE' ? check : null))).toEqual([
        null,
        support,
        null,
        support,
      ]);
      expect(funciones).toEqual([['v', true, ['search_path=pg_catalog, pg_temp']]]);
    });

    it('`PUBLIC` no la ejecuta y `nimbo_app` sí', async () => {
      const [privileges] = (await owner.query(
        `SELECT has_function_privilege('public', $1, 'EXECUTE') AS public,
                has_function_privilege('nimbo_app', $1, 'EXECUTE') AS app`,
        [FUNCTION_SIGNATURE],
      )) as { public: boolean; app: boolean }[];

      expect(privileges).toEqual({ public: false, app: true });
    });

    it.each([
      ['un cliente', Role.CLIENT],
      ['un administrador', Role.ADMIN],
      ['un operador', Role.OPERATOR],
    ])('RN-5: %s recibe `42501` y nada cambia', async (_case, role) => {
      const client = await newClient();
      const fileId = await file(client, IN_FORCE);
      const actor = createActor(await insertAccount(owner, role), role);

      await expect(
        restoreAs(actor, { ownerId: client.id, type: 'file', nodeId: fileId }),
      ).rejects.toMatchObject({
        code: '42501',
      });
      expect((await nodeOf(client, 'archivo', fileId)).eliminado_en).not.toBeNull();
    });
  });

  describe('restaurar (CA-11; 006 CA-13 a CA-15)', () => {
    it('un archivo vuelve a su carpeta viva con su nombre, y el tamaño es el de su versión actual', async () => {
      const client = await newClient();
      const parent = await folder(client);
      const fileId = await file(client, {
        ...IN_FORCE,
        name: 'acta.pdf',
        folderId: parent.id,
        sizeBytes: 700n,
      });

      const [row] = await restore({ ownerId: client.id, type: 'file', nodeId: fileId });

      expect(row).toEqual({
        resultado: 'restored',
        nombre_original: 'acta.pdf',
        elementos: 1,
        bytes: '700',
      });
      expect(await nodeOf(client, 'archivo', fileId)).toMatchObject({
        nombre: 'acta.pdf',
        padre: parent.id,
        eliminado_en: null,
        purgar_en: null,
      });
    });

    it('si su nombre está ocupado (sin distinguir mayúsculas), vuelve como «nombre (1)»', async () => {
      const client = await newClient();
      await file(client, { name: 'ACTA.pdf' });
      const fileId = await file(client, { ...IN_FORCE, name: 'acta.pdf' });

      const [row] = await restore({ ownerId: client.id, type: 'file', nodeId: fileId });

      expect(row?.resultado).toBe('renamed');
      expect((await nodeOf(client, 'archivo', fileId)).nombre).toBe('acta (1).pdf');
    });

    it('si su carpeta ya no está viva, vuelve a la raíz (`moved_to_root`)', async () => {
      const client = await newClient();
      const parent = await folder(client, IN_FORCE);
      const fileId = await file(client, { ...IN_FORCE, folderId: parent.id });

      const [row] = await restore({ ownerId: client.id, type: 'file', nodeId: fileId });

      expect(row?.resultado).toBe('moved_to_root');
      expect((await nodeOf(client, 'archivo', fileId)).padre).toBeNull();
    });

    it('una carpeta vuelve con lo que arrastró, reubica `ruta` y `profundidad` de su subárbol y deja en la papelera lo eliminado aparte', async () => {
      const client = await newClient();
      const gone = await folder(client, IN_FORCE);
      const root = await folder(client, { ...IN_FORCE, parent: gone });
      const carried = { ...IN_FORCE, trashedWithFolderId: root.id };
      const child = await folder(client, { ...carried, parent: root });
      const apart = await folder(client, { ...IN_FORCE, parent: child });
      const carriedFile = await file(client, { ...carried, folderId: child.id, sizeBytes: 300n });
      const apartFile = await file(client, { ...IN_FORCE, folderId: root.id, sizeBytes: 5n });

      const [row] = await restore({ ownerId: client.id, type: 'folder', nodeId: root.id });

      expect(row).toMatchObject({ resultado: 'moved_to_root', elementos: 3, bytes: '300' });
      expect(await nodeOf(client, 'carpeta', root.id)).toMatchObject({
        padre: null,
        ruta: `/${root.id}/`,
        profundidad: 1,
        eliminado_en: null,
      });
      expect(await nodeOf(client, 'carpeta', child.id)).toMatchObject({
        ruta: `/${root.id}/${child.id}/`,
        profundidad: 2,
        eliminado_en: null,
        eliminado_con_carpeta_id: null,
      });
      expect(await nodeOf(client, 'carpeta', apart.id)).toMatchObject({
        ruta: `/${root.id}/${child.id}/${apart.id}/`,
        profundidad: 3,
      });
      expect((await nodeOf(client, 'carpeta', apart.id)).eliminado_en).not.toBeNull();
      expect((await nodeOf(client, 'archivo', carriedFile)).eliminado_en).toBeNull();
      expect((await nodeOf(client, 'archivo', apartFile)).eliminado_en).not.toBeNull();
    });

    it('CA-12: si la carpeta más honda superaría `p_max_profundidad`, `depth_exceeded` y nada cambia', async () => {
      const client = await newClient();
      const parent = await folder(client);
      const root = await folder(client, { ...IN_FORCE, parent });
      await folder(client, { ...IN_FORCE, parent: root, trashedWithFolderId: root.id });
      const before = await nodeOf(client, 'carpeta', root.id);

      const [row] = await restore({
        ownerId: client.id,
        type: 'folder',
        nodeId: root.id,
        maxDepth: 2,
      });

      expect(row?.resultado).toBe('depth_exceeded');
      expect(await nodeOf(client, 'carpeta', root.id)).toEqual(before);
    });
  });

  describe('0 filas y nada cambia (CA-12, CA-15)', () => {
    it.each([
      [
        'una raíz vencida',
        'file',
        { deletedAt: new Date(Date.now() - DAY_MS), purgeAt: new Date(Date.now() - 1) },
      ],
      ['un archivo vivo', 'file', {}],
      ['el tipo equivocado', 'folder', IN_FORCE],
      ['un tipo desconocido', 'nodo', IN_FORCE],
    ] as const)('%s', async (_case, type, options) => {
      const client = await newClient();
      const fileId = await file(client, options);
      const before = await nodeOf(client, 'archivo', fileId);

      await expect(restore({ ownerId: client.id, type, nodeId: fileId })).resolves.toEqual([]);
      expect(await nodeOf(client, 'archivo', fileId)).toEqual(before);
    });

    it('un archivo que arrastró una carpeta (no es raíz)', async () => {
      const client = await newClient();
      const root = await folder(client, IN_FORCE);
      const fileId = await file(client, {
        ...IN_FORCE,
        folderId: root.id,
        trashedWithFolderId: root.id,
      });

      await expect(restore({ ownerId: client.id, type: 'file', nodeId: fileId })).resolves.toEqual(
        [],
      );
    });

    it('CA-15: la raíz de A pedida con el id de B no se toca', async () => {
      const ana = await newClient();
      const bruno = await newClient();
      const fileId = await file(ana, IN_FORCE);

      await expect(restore({ ownerId: bruno.id, type: 'file', nodeId: fileId })).resolves.toEqual(
        [],
      );
      expect((await nodeOf(ana, 'archivo', fileId)).eliminado_en).not.toBeNull();
    });
  });

  /**
   * La regla del nombre vive en SQL (plan §3) y en `node-name.ts` (005, 006): esta tabla exige el mismo resultado en
   * las dos para que no se separen.
   */
  describe('equivalencia del primer nombre libre con `FileName`/`FolderName.firstFree`', () => {
    const long = (length: number): string => 'x'.repeat(length);

    it.each([
      ['ocupado en mayúsculas', 'informe.pdf', ['INFORME.pdf']],
      ['con la copia (1) ocupada', 'informe.pdf', ['informe.pdf', 'informe (1).pdf']],
      ['que empieza con punto', '.env', ['.env']],
      ['que termina en punto', 'notas.', ['notas.']],
      ['con dos extensiones', 'archivo.tar.gz', ['archivo.tar.gz']],
      ['con acentos y eñe', 'Ñandú.pdf', ['ñANDÚ.pdf']],
      ['de 255 caracteres', `${long(251)}.pdf`, [`${long(251)}.pdf`]],
      ['recortado justo después de un espacio', `${long(246)} yyyy.pdf`, [`${long(246)} yyyy.pdf`]],
    ])('archivo %s', async (_case, name, taken) => {
      const client = await newClient();
      for (const other of taken) await file(client, { name: other });
      const fileId = await file(client, { ...IN_FORCE, name });

      await restore({ ownerId: client.id, type: 'file', nodeId: fileId });

      const expected = FileName.of(name).firstFree(taken).value;
      expect((await nodeOf(client, 'archivo', fileId)).nombre).toBe(expected);
    });

    it.each([
      ['ocupado en minúsculas', 'Contratos', ['contratos']],
      ['con punto (sin extensión)', 'v1.2', ['v1.2']],
      ['con las copias (1) y (2) ocupadas', 'Fotos', ['Fotos', 'Fotos (1)', 'fotos (2)']],
      ['recortada justo después de un espacio', `${long(250)} yyy`, [`${long(250)} yyy`]],
    ])('carpeta %s', async (_case, name, taken) => {
      const client = await newClient();
      for (const other of taken) await folder(client, { name: other });
      const root = await folder(client, { ...IN_FORCE, name });

      await restore({ ownerId: client.id, type: 'folder', nodeId: root.id });

      const expected = FolderName.of(name).firstFree(taken).value;
      expect((await nodeOf(client, 'carpeta', root.id)).nombre).toBe(expected);
    });
  });

  /**
   * Solo esta migración, en una transacción que se revierte: revertir también las posteriores arrastraría `down` de
   * otras specs que validan FK con datos y RLS (p. ej. 012 `carpeta-del-mismo-propietario`) y la prueba dejaría de
   * medir lo suyo. La cadena completa sobre una base vacía la recorre `scripts/ci/migrations-roundtrip.sh`.
   */
  it('down → up: el `down` quita la función y las cuatro políticas, y el `up` las vuelve a poner', async () => {
    const before = await schemaOf();
    const migration = new SoporteRestauraLaPapelera20261026100100();

    const [afterDown, afterUp] = await inRolledBackTransaction(owner, async (runner) => {
      await migration.down(runner);
      const down = await schemaOf(runner);
      await migration.up(runner);
      return [down, await schemaOf(runner)] as const;
    });

    expect(afterDown).toEqual({ politicas: null, funciones: null });
    expect(afterUp).toEqual(before);
  });
});
