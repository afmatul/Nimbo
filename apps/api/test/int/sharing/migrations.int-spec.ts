import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { startRestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectAsOwner, connectTo } from '../../support/database-urls';
import { revertFrom } from '../billing/billing-test-db';
import {
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
} from '../storage/storage-test-db';

import { insertShare } from './sharing-test-db';
import type { ShareRow } from './sharing-test-db';

const MIGRATION = 'CrearComparticion20261101100000';
const POLICIES_MIGRATION = 'PoliticasRlsNodosCompartidos20261101100100';
const EDITING_POLICIES_MIGRATION = 'PoliticasRlsEdicionYAgenteCompartidos20261101100200';

/** Políticas de `nimbo_app` que toca la migración B de 012, con su condición tal como la guarda Postgres. */
const RECIPIENT_POLICIES_SQL = `SELECT p.tablename, p.policyname, p.cmd, p.qual
   FROM pg_policies p
  WHERE p.tablename IN ('archivo', 'carpeta', 'version_archivo', 'indexacion', 'fragmento')
    AND 'nimbo_app' = ANY (p.roles)
  ORDER BY p.tablename, p.policyname`;

/** Políticas de `nimbo_app` que toca la migración C de 012 (Editor y agente), con su comando y su condición. */
const EDITING_POLICIES_SQL = `SELECT p.tablename, p.policyname, p.cmd, p.qual
   FROM pg_policies p
  WHERE p.tablename IN ('sesion_edicion', 'participacion', 'indexacion', 'fragmento')
    AND 'nimbo_app' = ANY (p.roles)
  ORDER BY p.tablename, p.policyname`;

/** Políticas que crea la migración C, por tabla, con su comando. */
const EDITING_POLICIES = [
  ['fragmento', 'fragmento_compartido', 'SELECT'],
  ['indexacion', 'indexacion_compartida', 'SELECT'],
  ['participacion', 'participacion_compartida', 'SELECT'],
  ['participacion', 'participacion_compartida_alta', 'INSERT'],
  ['participacion', 'participacion_compartida_cambio', 'UPDATE'],
  ['sesion_edicion', 'sesion_edicion_compartida', 'SELECT'],
  ['sesion_edicion', 'sesion_edicion_compartida_alta', 'INSERT'],
  ['sesion_edicion', 'sesion_edicion_compartida_bloqueo', 'UPDATE'],
];

interface PolicyRow {
  readonly tablename: string;
  readonly policyname: string;
  readonly cmd: string;
  readonly qual: string;
}

/** Lo que crea la migración A de 012: tabla, índices, políticas (también las del dueño en `archivo`/`carpeta`) y función. */
const SHARING_SCHEMA_SQL = `SELECT
  to_regclass('public.comparticion')::text AS tabla,
  (SELECT json_agg(i.indexname ORDER BY i.indexname) FROM pg_indexes i WHERE i.tablename = 'comparticion') AS indices,
  (SELECT json_agg(json_build_array(p.tablename, p.policyname, p.cmd) ORDER BY p.tablename, p.policyname)
     FROM pg_policies p WHERE p.tablename IN ('comparticion', 'archivo', 'carpeta')) AS politicas,
  (SELECT json_build_array(relrowsecurity, relforcerowsecurity) FROM pg_class
    WHERE oid = to_regclass('public.comparticion')) AS rls,
  to_regprocedure('public.nodos_compartidos()')::text AS funcion`;

interface SharingSchema {
  readonly tabla: string | null;
  readonly indices: string[] | null;
  readonly politicas: [string, string, string][];
  readonly rls: [boolean, boolean] | null;
  readonly funcion: string | null;
}

interface SharedNodeRow {
  readonly nodo_id: string;
  readonly tipo_nodo: string;
  readonly nivel: string;
}

const sharingSchemaOf = async (dataSource: DataSource): Promise<SharingSchema> =>
  ((await dataSource.query(SHARING_SCHEMA_SQL)) as SharingSchema[])[0] as SharingSchema;

const byNode = (rows: readonly SharedNodeRow[]): SharedNodeRow[] =>
  [...rows].sort((a, b) => a.nodo_id.localeCompare(b.nodo_id));

/**
 * Migración A de 012 (plan §3). El ciclo `up → down → up` y `nodos_compartidos()` corren con un dueño **sin**
 * `SUPERUSER` (ADR-0021): la función es `SECURITY DEFINER` y, con `FORCE` RLS, solo ve lo que le dejan las políticas
 * `*_nodos_compartidos` (`TO CURRENT_USER`); con un superusuario la prueba pasaría en vacío. Las *fixtures* de nodos y
 * comparticiones se insertan como `nimbo_app` dentro de `withActor` (el dueño no tiene política de `INSERT`).
 */
describe('migración crear-comparticion con dueño NOSUPERUSER (plan 012 §3)', () => {
  let database: RestrictedOwnerDatabase;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let ana: Actor;
  let bruno: Actor;
  let carla: Actor;
  let admin: Actor;
  const nodes = {
    folder: '',
    subfolder: '',
    inFolder: '',
    inSubfolder: '',
    trashed: '',
    alone: '',
  };
  let leaveShareId = '';

  const asActor = <T>(actor: Actor, work: (manager: EntityManager) => Promise<T>): Promise<T> =>
    transactions.withActor(actor, () => work(context.requireActorScope(actor)));

  const newActor = async (role: Role = Role.CLIENT): Promise<Actor> =>
    createActor(await insertAccount(owner, role), role);

  const sharedWith = (actor: Actor): Promise<SharedNodeRow[]> =>
    asActor(actor, async (manager) =>
      byNode((await manager.query('SELECT * FROM nodos_compartidos()')) as SharedNodeRow[]),
    );

  const shareAsAna = (share: Omit<ShareRow, 'ownerId'>): Promise<string> =>
    asActor(ana, (manager) => insertShare(manager, { ownerId: ana.id, ...share }));

  /** Carpeta con subcarpeta, un archivo en cada una, uno en la papelera y uno suelto en la raíz, todo de Ana. */
  const seedAnaTree = (): Promise<void> =>
    asActor(ana, async (manager) => {
      const folder = await insertFolder(manager, ana.id);
      const subfolder = await insertFolder(manager, ana.id, { parent: folder });
      nodes.folder = folder.id;
      nodes.subfolder = subfolder.id;
      nodes.inFolder = (
        await insertFileWithVersion(manager, ana.id, { folderId: folder.id })
      ).fileId;
      nodes.inSubfolder = (
        await insertFileWithVersion(manager, ana.id, { folderId: subfolder.id })
      ).fileId;
      nodes.trashed = (
        await insertFileWithVersion(manager, ana.id, { folderId: folder.id, deletedAt: new Date() })
      ).fileId;
      nodes.alone = (await insertFileWithVersion(manager, ana.id)).fileId;
    });

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    [ana, bruno, carla, admin] = [
      await newActor(),
      await newActor(),
      await newActor(),
      await newActor(Role.ADMIN),
    ];
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  it('el dueño que migra no es superusuario ni tiene BYPASSRLS (si no, la prueba pasaría en vacío)', async () => {
    const [role] = (await owner.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    )) as { rolsuper: boolean; rolbypassrls: boolean }[];

    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('RNF-10: up → down → up: el `down` borra tabla, políticas y función, y el `up` vuelve al mismo esquema', async () => {
    const before = await sharingSchemaOf(owner);

    const reverted = await revertFrom(owner, MIGRATION);
    const afterDown = await sharingSchemaOf(owner);
    const rerun = await owner.runMigrations({ transaction: 'each' });

    expect(before).toEqual({
      tabla: 'comparticion',
      indices: [
        'comparticion_pkey',
        'idx_comparticion_destinatario',
        'uq_comparticion_archivo_destinatario',
        'uq_comparticion_carpeta_destinatario',
      ],
      politicas: expect.arrayContaining([
        ['archivo', 'archivo_nodos_compartidos', 'SELECT'],
        ['carpeta', 'carpeta_nodos_compartidos', 'SELECT'],
        ['comparticion', 'comparticion_destinatario', 'SELECT'],
        ['comparticion', 'comparticion_destinatario_salir', 'DELETE'],
        ['comparticion', 'comparticion_nodos_compartidos', 'SELECT'],
        ['comparticion', 'comparticion_propietario', 'ALL'],
      ]) as unknown,
      rls: [true, true],
      funcion: 'nodos_compartidos()',
    });
    expect(afterDown.tabla).toBeNull();
    expect(afterDown.funcion).toBeNull();
    const policiesAfterDown = afterDown.politicas.map(([, name]) => name);
    expect(policiesAfterDown).not.toContain('archivo_nodos_compartidos');
    expect(policiesAfterDown).not.toContain('carpeta_nodos_compartidos');
    expect(rerun.map((migration) => migration.name)).toEqual(reverted);
    expect(await sharingSchemaOf(owner)).toEqual(before);
  });

  it('RNF-10: migración B up → down → up: abre la lectura al destinatario, acota lo de 005/019 y lo devuelve', async () => {
    const policiesOf = async (): Promise<PolicyRow[]> =>
      (await owner.query(RECIPIENT_POLICIES_SQL)) as PolicyRow[];
    const before = await policiesOf();

    const reverted = await revertFrom(owner, POLICIES_MIGRATION);
    const afterDown = await policiesOf();
    await owner.runMigrations({ transaction: 'each' });

    const names = (rows: PolicyRow[]): string[] => rows.map((row) => row.policyname);
    const qualOf = (rows: PolicyRow[], name: string): string =>
      rows.find((row) => row.policyname === name)?.qual ?? '';
    expect(reverted).toEqual([POLICIES_MIGRATION, EDITING_POLICIES_MIGRATION]);
    expect(names(before)).toEqual(
      expect.arrayContaining([
        'archivo_compartido',
        'carpeta_compartida',
        'version_archivo_compartida',
      ]),
    );
    expect(
      before
        .filter((row) => /^(archivo|carpeta|version_archivo)_compartid[oa]$/.test(row.policyname))
        .map((row) => row.cmd),
    ).toEqual(['SELECT', 'SELECT', 'SELECT']);
    for (const policy of ['version_archivo_cliente', 'indexacion_cliente', 'fragmento_cliente']) {
      expect(qualOf(before, policy)).toContain('propietario_id = nimbo_actor_id()');
      expect(qualOf(afterDown, policy)).not.toContain('propietario_id');
    }
    expect(names(afterDown)).not.toContain('archivo_compartido');
    expect(names(afterDown)).not.toContain('version_archivo_compartida');
    expect(await policiesOf()).toEqual(before);
  });

  it('RNF-10: migración C up → down → up: abre al Editor la sesión y al agente lo compartido, y lo devuelve', async () => {
    const policiesOf = async (): Promise<PolicyRow[]> =>
      (await owner.query(EDITING_POLICIES_SQL)) as PolicyRow[];
    const before = await policiesOf();

    const reverted = await revertFrom(owner, EDITING_POLICIES_MIGRATION);
    const afterDown = await policiesOf();
    await owner.runMigrations({ transaction: 'each' });

    const created = (rows: PolicyRow[]): string[][] =>
      rows
        .filter((row) => /_compartid[oa](_\w+)?$/.test(row.policyname))
        .map((row) => [row.tablename, row.policyname, row.cmd]);
    const qualOf = (rows: PolicyRow[], name: string): string =>
      rows.find((row) => row.policyname === name)?.qual ?? '';
    expect(reverted).toEqual([EDITING_POLICIES_MIGRATION]);
    expect(created(before)).toEqual(EDITING_POLICIES);
    expect(qualOf(before, 'participacion_cliente')).toContain('propietario_id = nimbo_actor_id()');
    expect(qualOf(afterDown, 'participacion_cliente')).not.toContain('propietario_id');
    expect(created(afterDown)).toEqual([]);
    expect(await policiesOf()).toEqual(before);
  });

  it('RNF-05: `nodos_compartidos()` no la ejecuta `PUBLIC` y sí `nimbo_app`', async () => {
    const [grants] = (await owner.query(
      `SELECT has_function_privilege('nimbo_app', 'nodos_compartidos()', 'EXECUTE') AS app,
              EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                       WHERE p.oid = 'nodos_compartidos()'::regprocedure AND a.grantee = 0) AS publico,
              (SELECT prosecdef FROM pg_proc WHERE oid = 'nodos_compartidos()'::regprocedure) AS definer,
              (SELECT provolatile FROM pg_proc WHERE oid = 'nodos_compartidos()'::regprocedure) AS volatilidad`,
    )) as { app: boolean; publico: boolean; definer: boolean; volatilidad: string }[];

    expect(grants).toEqual({ app: true, publico: false, definer: true, volatilidad: 's' });
  });

  describe('con nodos de Ana compartidos con Bruno', () => {
    beforeAll(async () => {
      await seedAnaTree();
      await shareAsAna({ granteeId: bruno.id, node: { folderId: nodes.folder }, level: 'EDITOR' });
      await shareAsAna({ granteeId: bruno.id, node: { fileId: nodes.inFolder } });
      leaveShareId = await shareAsAna({ granteeId: bruno.id, node: { fileId: nodes.alone } });
    });

    it('CA-21: Bruno alcanza lo directo y el subárbol vivo de la carpeta, con el nivel mayor por nodo', async () => {
      expect(await sharedWith(bruno)).toEqual(
        byNode([
          { nodo_id: nodes.folder, tipo_nodo: 'carpeta', nivel: 'EDITOR' },
          { nodo_id: nodes.subfolder, tipo_nodo: 'carpeta', nivel: 'EDITOR' },
          { nodo_id: nodes.inFolder, tipo_nodo: 'archivo', nivel: 'EDITOR' },
          { nodo_id: nodes.inSubfolder, tipo_nodo: 'archivo', nivel: 'EDITOR' },
          { nodo_id: nodes.alone, tipo_nodo: 'archivo', nivel: 'VIEWER' },
        ]),
      );
    });

    it('CA-21: Carla y Ana no alcanzan nada por `nodos_compartidos()`; un rol interno y sin actor, tampoco', async () => {
      const [withoutActor] = (await app.query(
        'SELECT count(*)::int AS n FROM nodos_compartidos()',
      )) as { n: number }[];

      expect(await sharedWith(carla)).toEqual([]);
      expect(await sharedWith(ana)).toEqual([]);
      expect(await sharedWith(admin)).toEqual([]);
      expect(withoutActor?.n).toBe(0);
    });

    it('CA-17: con la propietaria suspendida no alcanza nada; al reactivarla vuelve igual', async () => {
      const before = await sharedWith(bruno);

      await owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [ana.id]);
      const suspended = await sharedWith(bruno);
      await owner.query("UPDATE usuario SET estado = 'activa' WHERE id = $1", [ana.id]);

      expect(suspended).toEqual([]);
      expect(await sharedWith(bruno)).toEqual(before);
    });

    it('RNF-05: la propietaria ve sus comparticiones; Bruno las suyas; Carla y un rol interno, ninguna', async () => {
      const count = (actor: Actor): Promise<number> =>
        asActor(actor, async (manager) => {
          const [row] = (await manager.query('SELECT count(*)::int AS n FROM comparticion')) as {
            n: number;
          }[];
          return row?.n ?? 0;
        });

      await expect(count(ana)).resolves.toBe(3);
      await expect(count(bruno)).resolves.toBe(3);
      await expect(count(carla)).resolves.toBe(0);
      await expect(count(admin)).resolves.toBe(0);
    });

    it('RNF-05: el destinatario no cambia su nivel ni comparte lo ajeno a su nombre (WITH CHECK)', async () => {
      const updated = await asActor(bruno, (manager) =>
        manager.query("UPDATE comparticion SET nivel = 'EDITOR' WHERE destinatario_id = $1", [
          bruno.id,
        ]),
      );

      expect((updated as [unknown[], number])[1]).toBe(0);
      await expect(
        asActor(bruno, (manager) =>
          insertShare(manager, {
            ownerId: bruno.id,
            granteeId: carla.id,
            node: { fileId: nodes.alone },
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('CA-23: el destinatario borra su propio acceso directo (Salir) y deja de alcanzar el nodo', async () => {
      const deleted = await asActor(bruno, (manager) =>
        manager.query('DELETE FROM comparticion WHERE id = $1', [leaveShareId]),
      );

      expect((deleted as [unknown[], number])[1]).toBe(1);
      expect((await sharedWith(bruno)).map((row) => row.nodo_id)).not.toContain(nodes.alone);
    });

    it('CA-23: un tercero no borra el acceso de otro', async () => {
      const deleted = await asActor(carla, (manager) =>
        manager.query('DELETE FROM comparticion WHERE destinatario_id = $1', [bruno.id]),
      );

      expect((deleted as [unknown[], number])[1]).toBe(0);
    });
  });
});

/** Variante inválida de una fila de `comparticion`: nivel, consigo mismo o con los dos nodos. */
interface InvalidShare {
  readonly level?: string;
  readonly self?: boolean;
  readonly both?: boolean;
}

/** Restricciones de `comparticion` sobre la base del arnés, en una transacción que se revierte. */
describe('restricciones de `comparticion` (plan 012 §3)', () => {
  let harnessOwner: DataSource;

  beforeAll(async () => {
    harnessOwner = await connectAsOwner();
  });

  afterAll(async () => {
    await harnessOwner.destroy();
  });

  const anaAndBruno = async (runner: QueryRunner) => {
    const ownerId = await insertAccount(runner);
    const granteeId = await insertAccount(runner);
    const { fileId } = await insertFileWithVersion(runner, ownerId);
    return { ownerId, granteeId, fileId };
  };

  it.each<[string, InvalidShare, RegExp]>([
    ['el nivel `OWNER` (DF-31)', { level: 'OWNER' }, /ck_comparticion_nivel/],
    ['un nivel desconocido', { level: 'ADMIN' }, /ck_comparticion_nivel/],
    ['compartir consigo mismo', { self: true }, /ck_comparticion_distinto/],
    ['un archivo y una carpeta a la vez', { both: true }, /ck_comparticion_nodo/],
  ])('CA-2: rechaza %s', async (_case, variant, constraint) => {
    await expect(
      inRolledBackTransaction(harnessOwner, async (runner) => {
        const { ownerId, granteeId, fileId } = await anaAndBruno(runner);
        const folder = variant.both ? (await insertFolder(runner, ownerId)).id : null;
        await runner.query(
          `INSERT INTO comparticion (propietario_id, destinatario_id, archivo_id, carpeta_id, nivel)
           VALUES ($1, $2, $3, $4, $5)`,
          [ownerId, variant.self ? ownerId : granteeId, fileId, folder, variant.level ?? 'VIEWER'],
        );
      }),
    ).rejects.toThrow(constraint);
  });

  it('RN-2: una persona tiene a lo sumo un acceso directo por nodo', async () => {
    await expect(
      inRolledBackTransaction(harnessOwner, async (runner) => {
        const { ownerId, granteeId, fileId } = await anaAndBruno(runner);
        const share = { ownerId, granteeId, node: { fileId } };
        await insertShare(runner, share);
        await insertShare(runner, { ...share, level: 'EDITOR' });
      }),
    ).rejects.toThrow(/uq_comparticion_archivo_destinatario/);
  });

  it('CA-18: borrar el archivo definitivamente borra sus comparticiones', async () => {
    const left = await inRolledBackTransaction(harnessOwner, async (runner) => {
      const { ownerId, granteeId, fileId } = await anaAndBruno(runner);
      await insertShare(runner, { ownerId, granteeId, node: { fileId } });
      await runner.query('DELETE FROM archivo WHERE id = $1', [fileId]);
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM comparticion WHERE archivo_id = $1',
        [fileId],
      )) as { n: number }[];
      return row?.n;
    });

    expect(left).toBe(0);
  });
});
