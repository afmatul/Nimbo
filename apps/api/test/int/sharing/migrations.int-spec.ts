import type { DataSource, EntityManager, QueryRunner } from 'typeorm';

import type { Actor } from '../../../src/shared';
import { createActor, Role } from '../../../src/shared';
import { TransactionContext } from '../../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import {
  RESTRICTED_OWNER_ROLE,
  startRestrictedOwnerDatabase,
} from '../../isolation/setup/nosuperuser-postgres';
import type { RestrictedOwnerDatabase } from '../../isolation/setup/nosuperuser-postgres';
import { connectAsOwner, connectTo } from '../../support/database-urls';
import { revertFrom } from '../billing/billing-test-db';
import {
  inRolledBackTransaction,
  insertAccount,
  insertFileWithVersion,
  insertFolder,
} from '../storage/storage-test-db';

import { insertPublicLink, insertShare, randomTokenHash } from './sharing-test-db';
import type { PublicLinkRow, ShareRow } from './sharing-test-db';

const MIGRATION = 'CrearComparticion20261101100000';
const POLICIES_MIGRATION = 'PoliticasRlsNodosCompartidos20261101100100';
const EDITING_POLICIES_MIGRATION = 'PoliticasRlsEdicionYAgenteCompartidos20261101100200';
const LEAVE_AUDIT_MIGRATION = 'AuditoriaAlSalirDeComparticion20261101100300';
const SAME_OWNER_FOLDER_MIGRATION = 'CarpetaDelMismoPropietario20261101100400';
const PUBLIC_LINK_MIGRATION = 'CrearEnlacePublico20261102100000';
const PUBLIC_LINK_FUNCTION = 'enlace_por_token(character)';

/** Lo que crea la migración de 013: tabla, índices, restricciones, políticas (con sus roles), RLS y función. */
const PUBLIC_LINK_SCHEMA_SQL = `SELECT
  to_regclass('public.enlace_publico')::text AS tabla,
  (SELECT json_agg(i.indexname ORDER BY i.indexname) FROM pg_indexes i WHERE i.tablename = 'enlace_publico') AS indices,
  (SELECT json_agg(c.conname ORDER BY c.conname) FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.enlace_publico') AND c.contype = 'c') AS checks,
  (SELECT json_agg(json_build_array(p.policyname, p.cmd, p.roles::text) ORDER BY p.policyname)
     FROM pg_policies p WHERE p.tablename = 'enlace_publico') AS politicas,
  (SELECT json_build_array(relrowsecurity, relforcerowsecurity) FROM pg_class
    WHERE oid = to_regclass('public.enlace_publico')) AS rls,
  to_regprocedure('public.${PUBLIC_LINK_FUNCTION}')::text AS funcion`;

interface PublicLinkSchema {
  readonly tabla: string | null;
  readonly indices: string[] | null;
  readonly checks: string[] | null;
  readonly politicas: [string, string, string][] | null;
  readonly rls: [boolean, boolean] | null;
  readonly funcion: string | null;
}

/** Atributos de `enlace_por_token()` en `pg_proc` y quién puede ejecutarla. */
const PUBLIC_LINK_FUNCTION_SQL = `SELECT p.prosecdef AS definer, p.provolatile AS volatilidad,
        p.proconfig AS config, pg_get_userbyid(p.proowner) AS dueno,
        pg_get_function_result(p.oid) AS resultado,
        has_function_privilege('nimbo_app', p.oid, 'EXECUTE') AS app,
        EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS publico
   FROM pg_proc p WHERE p.oid = '${PUBLIC_LINK_FUNCTION}'::regprocedure`;

interface LinkIds {
  readonly enlace_id: string;
  readonly archivo_id: string;
  readonly propietario_id: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY_MS);

/** Políticas de `nimbo_app` que toca la migración B de 012, con su condición tal como la guarda Postgres. */
const RECIPIENT_POLICIES_SQL = `SELECT p.tablename, p.policyname, p.cmd, p.qual
   FROM pg_policies p
  WHERE p.tablename IN ('archivo', 'carpeta', 'version_archivo', 'indexacion', 'fragmento')
    AND 'nimbo_app' = ANY (p.roles)
  ORDER BY p.tablename, p.policyname`;

/** Políticas de `nimbo_app` que toca la migración C de 012 (Editor y agente), con su comando y su condición. */
const EDITING_POLICIES_SQL = `SELECT p.tablename, p.policyname, p.cmd, p.qual, p.permissive
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

/** Políticas `AS RESTRICTIVE` de la migración C: toda escritura de `sesion_edicion` es de la propietaria (SEC-2, SEC-4). */
const RESTRICTIVE_SESSION_POLICIES = [
  ['sesion_edicion', 'sesion_edicion_alta_de_la_propietaria', 'INSERT'],
  ['sesion_edicion', 'sesion_edicion_cambio_de_la_propietaria', 'UPDATE'],
];

/** FK hacia `carpeta` y claves únicas no primarias de `archivo`/`carpeta` (migración E de 012, SEC-1). */
const FOLDER_CONSTRAINTS_SQL = `SELECT conname, pg_get_constraintdef(oid) AS definicion
   FROM pg_constraint
  WHERE conrelid IN ('archivo'::regclass, 'carpeta'::regclass)
    AND (confrelid = 'carpeta'::regclass OR contype = 'u')
  ORDER BY conname`;

interface PolicyRow {
  readonly tablename: string;
  readonly policyname: string;
  readonly cmd: string;
  readonly qual: string;
  readonly permissive?: string;
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
 * Migraciones de 012 y la de 013 (plan §3 de cada una). Los ciclos `up → down → up`, `nodos_compartidos()` y
 * `enlace_por_token()` corren con un dueño **sin** `SUPERUSER` (ADR-0021, ADR-0039): las funciones son
 * `SECURITY DEFINER` y, con `FORCE` RLS, solo ven lo que les dejan las políticas `*_nodos_compartidos` y
 * `enlace_publico_por_token` (`TO CURRENT_USER`); con un superusuario la prueba pasaría en vacío. Las *fixtures* de
 * nodos, comparticiones y enlaces se insertan como `nimbo_app` dentro de `withActor` (el dueño no tiene política de
 * `INSERT`).
 */
describe('migraciones de `sharing` con dueño NOSUPERUSER (planes 012 §3 y 013 §3)', () => {
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
    expect(reverted).toEqual([
      POLICIES_MIGRATION,
      EDITING_POLICIES_MIGRATION,
      LEAVE_AUDIT_MIGRATION,
      SAME_OWNER_FOLDER_MIGRATION,
      PUBLIC_LINK_MIGRATION,
    ]);
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
    const restrictive = (rows: PolicyRow[]): string[][] =>
      rows
        .filter((row) => row.permissive === 'RESTRICTIVE')
        .map((row) => [row.tablename, row.policyname, row.cmd]);
    const qualOf = (rows: PolicyRow[], name: string): string =>
      rows.find((row) => row.policyname === name)?.qual ?? '';
    expect(reverted).toEqual([
      EDITING_POLICIES_MIGRATION,
      LEAVE_AUDIT_MIGRATION,
      SAME_OWNER_FOLDER_MIGRATION,
      PUBLIC_LINK_MIGRATION,
    ]);
    expect(created(before)).toEqual(EDITING_POLICIES);
    expect(restrictive(before)).toEqual(RESTRICTIVE_SESSION_POLICIES);
    expect(restrictive(afterDown)).toEqual([]);
    expect(qualOf(before, 'participacion_cliente')).toContain('propietario_id = nimbo_actor_id()');
    expect(qualOf(afterDown, 'participacion_cliente')).not.toContain('propietario_id');
    expect(created(afterDown)).toEqual([]);
    expect(await policiesOf()).toEqual(before);
  });

  it('RNF-10: migración E up → down → up: archivos y carpetas solo cuelgan de una carpeta del mismo propietario', async () => {
    const constraintsOf = async (): Promise<string[]> =>
      (
        (await owner.query(FOLDER_CONSTRAINTS_SQL)) as { conname: string; definicion: string }[]
      ).map((row) => `${row.conname}: ${row.definicion}`);
    const before = await constraintsOf();

    const reverted = await revertFrom(owner, SAME_OWNER_FOLDER_MIGRATION);
    const afterDown = await constraintsOf();
    await owner.runMigrations({ transaction: 'each' });

    expect(reverted).toEqual([SAME_OWNER_FOLDER_MIGRATION, PUBLIC_LINK_MIGRATION]);
    expect(before).toEqual([
      'fk_archivo_carpeta_propietario: FOREIGN KEY (carpeta_id, propietario_id) REFERENCES carpeta(id, propietario_id) ON DELETE SET NULL (carpeta_id)',
      'fk_archivo_eliminado_con_propietario: FOREIGN KEY (eliminado_con_carpeta_id, propietario_id) REFERENCES carpeta(id, propietario_id)',
      'fk_carpeta_eliminado_con_propietario: FOREIGN KEY (eliminado_con_carpeta_id, propietario_id) REFERENCES carpeta(id, propietario_id)',
      'fk_carpeta_padre_propietario: FOREIGN KEY (carpeta_padre_id, propietario_id) REFERENCES carpeta(id, propietario_id) ON DELETE SET NULL (carpeta_padre_id)',
      'uq_carpeta_id_propietario: UNIQUE (id, propietario_id)',
    ]);
    expect(afterDown).toEqual([
      'archivo_carpeta_id_fkey: FOREIGN KEY (carpeta_id) REFERENCES carpeta(id) ON DELETE SET NULL',
      'archivo_eliminado_con_carpeta_id_fkey: FOREIGN KEY (eliminado_con_carpeta_id) REFERENCES carpeta(id)',
      'carpeta_carpeta_padre_id_fkey: FOREIGN KEY (carpeta_padre_id) REFERENCES carpeta(id) ON DELETE SET NULL',
      'carpeta_eliminado_con_carpeta_id_fkey: FOREIGN KEY (eliminado_con_carpeta_id) REFERENCES carpeta(id)',
    ]);
    expect(await constraintsOf()).toEqual(before);
  });

  it('RNF-10 (013): up → down → up: el `down` borra función, políticas y tabla, y el `up` vuelve al mismo esquema', async () => {
    const schemaOf = async (): Promise<PublicLinkSchema> =>
      ((await owner.query(PUBLIC_LINK_SCHEMA_SQL)) as PublicLinkSchema[])[0] as PublicLinkSchema;
    const before = await schemaOf();

    const reverted = await revertFrom(owner, PUBLIC_LINK_MIGRATION);
    const afterDown = await schemaOf();
    await owner.runMigrations({ transaction: 'each' });

    expect(reverted).toEqual([PUBLIC_LINK_MIGRATION]);
    expect(before).toEqual({
      tabla: 'enlace_publico',
      indices: [
        'enlace_publico_pkey',
        'uq_enlace_publico_archivo_activo',
        'uq_enlace_publico_token_hash',
      ],
      checks: ['ck_enlace_publico_token_hash', 'ck_enlace_publico_vencimiento'],
      politicas: [
        ['enlace_publico_por_token', 'SELECT', `{${RESTRICTED_OWNER_ROLE}}`],
        ['enlace_publico_propietario', 'ALL', '{nimbo_app}'],
      ],
      rls: [true, true],
      funcion: PUBLIC_LINK_FUNCTION,
    });
    expect(afterDown).toEqual({
      tabla: null,
      indices: null,
      checks: null,
      politicas: null,
      rls: null,
      funcion: null,
    });
    expect(await schemaOf()).toEqual(before);
  });

  it('CA-17 (013, ADR-0039): `enlace_por_token()` es del dueño, `SECURITY DEFINER`, `STABLE`, con `search_path` cerrado y tres ids; solo `nimbo_app` la ejecuta', async () => {
    const [fn] = (await owner.query(PUBLIC_LINK_FUNCTION_SQL)) as Record<string, unknown>[];

    expect(fn).toEqual({
      definer: true,
      volatilidad: 's',
      config: ['search_path=pg_catalog, pg_temp'],
      dueno: RESTRICTED_OWNER_ROLE,
      resultado: 'TABLE(enlace_id uuid, archivo_id uuid, propietario_id uuid)',
      app: true,
      publico: false,
    });
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

  describe('`enlace_publico` y `enlace_por_token()` con enlaces de Ana (plan 013 §3, ADR-0039)', () => {
    const files = { linked: '', other: '', spare: '', trashed: '' };
    let active = { id: '', tokenHash: '' };

    const linkAsAna = (link: Omit<PublicLinkRow, 'ownerId'>) =>
      asActor(ana, (manager) => insertPublicLink(manager, { ownerId: ana.id, ...link }));

    const resolve = async (tokenHash: string): Promise<LinkIds[]> =>
      (await app.query('SELECT * FROM enlace_por_token($1)', [tokenHash])) as LinkIds[];

    const linkIdsSeenBy = (actor: Actor): Promise<string[]> =>
      asActor(actor, async (manager) =>
        ((await manager.query('SELECT id FROM enlace_publico')) as { id: string }[]).map(
          (row) => row.id,
        ),
      );

    const changedRows = async (actor: Actor, sql: string, params: unknown[]): Promise<number> =>
      ((await asActor(actor, (manager) => manager.query(sql, params))) as [unknown[], number])[1];

    const revoke = (actor: Actor, linkId: string): Promise<number> =>
      changedRows(actor, 'UPDATE enlace_publico SET revocado_en = now() WHERE id = $1', [linkId]);

    beforeAll(async () => {
      const newFile = async (options: { deletedAt?: Date } = {}): Promise<string> =>
        (await asActor(ana, (manager) => insertFileWithVersion(manager, ana.id, options))).fileId;
      files.linked = await newFile();
      files.other = await newFile();
      files.spare = await newFile();
      files.trashed = await newFile({ deletedAt: new Date() });
      active = await linkAsAna({ fileId: files.linked });
    });

    it('CA-17: sin actor `nimbo_app` no ve filas; la función da los tres ids solo para su hash', async () => {
      expect(await app.query('SELECT id FROM enlace_publico')).toEqual([]);
      expect(await resolve(active.tokenHash)).toEqual([
        { enlace_id: active.id, archivo_id: files.linked, propietario_id: ana.id },
      ]);
      expect(await resolve(randomTokenHash())).toEqual([]);
    });

    it('CA-11: la función no da un enlace revocado ni uno vencido', async () => {
      const revoked = await linkAsAna({ fileId: files.other });
      await revoke(ana, revoked.id);
      const expired = await linkAsAna({
        fileId: files.other,
        createdAt: daysFromNow(-8),
        expiresAt: daysFromNow(-1),
      });

      expect(await resolve(revoked.tokenHash)).toEqual([]);
      expect(await resolve(expired.tokenHash)).toEqual([]);
    });

    it('CA-17: Ana ve sus enlaces; Bruno, Carla y un rol interno, ninguno', async () => {
      expect(await linkIdsSeenBy(ana)).toContain(active.id);
      expect(await linkIdsSeenBy(bruno)).toEqual([]);
      expect(await linkIdsSeenBy(carla)).toEqual([]);
      expect(await linkIdsSeenBy(admin)).toEqual([]);
    });

    it('CA-17: Bruno no revoca el enlace de Ana y el enlace sigue sirviendo', async () => {
      expect(await revoke(bruno, active.id)).toBe(0);
      expect(await resolve(active.tokenHash)).toHaveLength(1);
    });

    it('CA-17: nadie crea un enlace a un archivo ajeno ni a nombre de otro (WITH CHECK)', async () => {
      const asBruno = (ownerId: string) =>
        asActor(bruno, (manager) => insertPublicLink(manager, { ownerId, fileId: files.spare }));

      await expect(asBruno(bruno.id)).rejects.toThrow(/row-level security/);
      await expect(asBruno(ana.id)).rejects.toThrow(/row-level security/);
    });

    it('RN-3: un archivo tiene a lo sumo un enlace sin revocar', async () => {
      await expect(linkAsAna({ fileId: files.linked })).rejects.toThrow(
        /uq_enlace_publico_archivo_activo/,
      );
    });

    it('CA-17: `nimbo_app` no borra enlaces ni cambia otra columna que `revocado_en`', async () => {
      await expect(
        changedRows(ana, 'DELETE FROM enlace_publico WHERE id = $1', [active.id]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        changedRows(
          ana,
          "UPDATE enlace_publico SET vence_en = now() + interval '30 days' WHERE id = $1",
          [active.id],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it('CA-8: Ana revoca el enlace de un archivo suyo en la papelera', async () => {
      const link = await linkAsAna({ fileId: files.trashed });

      expect(await revoke(ana, link.id)).toBe(1);
      expect(await resolve(link.tokenHash)).toEqual([]);
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

/** Restricciones de `enlace_publico` sobre la base del arnés, en una transacción que se revierte (plan 013 §3). */
describe('restricciones de `enlace_publico` (plan 013 §3)', () => {
  let harnessOwner: DataSource;

  beforeAll(async () => {
    harnessOwner = await connectAsOwner();
  });

  afterAll(async () => {
    await harnessOwner.destroy();
  });

  /** Inserta un archivo de una cuenta nueva y un enlace a él con `link`; devuelve lo que la prueba necesita. */
  const linkWith = async (
    runner: QueryRunner,
    link: Omit<PublicLinkRow, 'ownerId' | 'fileId'> = {},
  ): Promise<{ fileId: string; ownerId: string; tokenHash: string }> => {
    const ownerId = await insertAccount(runner);
    const { fileId } = await insertFileWithVersion(runner, ownerId);
    const { tokenHash } = await insertPublicLink(runner, { ownerId, fileId, ...link });
    return { fileId, ownerId, tokenHash };
  };

  it.each([
    ['en mayúsculas', 'A'.repeat(64)],
    ['de 63 caracteres', 'a'.repeat(63)],
    ['que no es hexadecimal', 'g'.repeat(64)],
  ])('DF-09: rechaza un `token_hash` %s', async (_case, tokenHash) => {
    await expect(
      inRolledBackTransaction(harnessOwner, (runner) => linkWith(runner, { tokenHash })),
    ).rejects.toThrow(/ck_enlace_publico_token_hash/);
  });

  it('RN-2: rechaza un vencimiento que no es posterior a la creación', async () => {
    const createdAt = new Date();

    await expect(
      inRolledBackTransaction(harnessOwner, (runner) =>
        linkWith(runner, { createdAt, expiresAt: createdAt }),
      ),
    ).rejects.toThrow(/ck_enlace_publico_vencimiento/);
  });

  it('DF-09: dos enlaces nunca comparten `token_hash`', async () => {
    await expect(
      inRolledBackTransaction(harnessOwner, async (runner) => {
        const { tokenHash } = await linkWith(runner);
        await linkWith(runner, { tokenHash });
      }),
    ).rejects.toThrow(/uq_enlace_publico_token_hash/);
  });

  it('RN-3: revocado el anterior, el archivo admite un enlace nuevo', async () => {
    const active = await inRolledBackTransaction(harnessOwner, async (runner) => {
      const { fileId, ownerId } = await linkWith(runner);
      await runner.query('UPDATE enlace_publico SET revocado_en = now() WHERE archivo_id = $1', [
        fileId,
      ]);
      await insertPublicLink(runner, { ownerId, fileId });
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM enlace_publico WHERE archivo_id = $1 AND revocado_en IS NULL',
        [fileId],
      )) as { n: number }[];
      return row?.n;
    });

    expect(active).toBe(1);
  });

  it('CA-11, RN-5: borrar el archivo definitivamente borra sus enlaces', async () => {
    const left = await inRolledBackTransaction(harnessOwner, async (runner) => {
      const { fileId } = await linkWith(runner);
      await runner.query('DELETE FROM archivo WHERE id = $1', [fileId]);
      const [row] = (await runner.query(
        'SELECT count(*)::int AS n FROM enlace_publico WHERE archivo_id = $1',
        [fileId],
      )) as { n: number }[];
      return row?.n;
    });

    expect(left).toBe(0);
  });
});
