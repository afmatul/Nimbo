import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { FILE_KINDS, listAuditEventsResponseSchema, restoreResponseSchema } from '@nimbo/contracts';
import type { AuditEventResponse, RestoreResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import type { DataSource } from 'typeorm';

import { AuditAction } from '../../src/modules/audit';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { buildTestEnv } from '../int/setup/test-app';
import type { TestApp } from '../int/setup/test-app';
import { insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';
import type { FileRowOptions, FolderRow } from '../int/storage/storage-test-db';
import { connectAsOwner } from '../support/database-urls';
import { createFullApiTestApp } from '../support/full-api-test-app';

import { comparable } from './setup/isolation-assertions';
import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld, WorldAccount } from './setup/isolation-world';

const TRASH = '/api/v1/backoffice/client-trash';
const MY_EVENTS = '/api/v1/audit/my-events';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const NOTE = 'La clienta lo pidió por teléfono';
const DAY_MS = 86_400_000;
const MAX_DEPTH = 10;
const LOCK_WAIT_MS = 1000;
/** Lo que Postgres responde cuando una política rechaza la sentencia (en vez de dejarla sin filas). */
const DENIED = /permission denied|row-level security/;
const FORBIDDEN = { status: 403, code: 'SHARED_FORBIDDEN' };
const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };

type TrashDates = Pick<FileRowOptions, 'deletedAt' | 'purgeAt'>;

/** En la papelera desde hace un día y con retención vigente. */
const inForce = (): TrashDates => ({
  deletedAt: new Date(Date.now() - DAY_MS),
  purgeAt: new Date(Date.now() + 29 * DAY_MS),
});

/** Con la retención vencida: es de la purga y Soporte ya no lo ve (011b RN-3). */
const expired = (): TrashDates => ({
  deletedAt: new Date(Date.now() - 40 * DAY_MS),
  purgeAt: new Date(Date.now() - DAY_MS),
});

/** Una carpeta en la papelera con una subcarpeta y un archivo que arrastró. */
interface Tree {
  readonly root: FolderRow;
  readonly child: FolderRow;
  readonly fileId: string;
}

interface AuditedRow {
  readonly fila: Record<string, unknown>;
}

interface PathRow {
  readonly id: string;
  readonly ruta: string;
  readonly profundidad: number;
  readonly padre_ruta: string | null;
}

/**
 * Aislamiento de la restauración de Soporte (spec 011b CA-15, plan §6 casos 1 a 5 y 8 a 11; ADR-0035; RNF-05) como
 * `nimbo_app`, contra la API completa y el mundo de aislamiento: A y B tienen papeleras gemelas. Las *fixtures* se
 * siembran como el dueño; la función `restaurar_raiz_papelera` con un dueño sin `SUPERUSER` se prueba en
 * `test/int/storage/support-trash.int-spec.ts`. Los casos 6 y 7 (funciones de `suscripcion`) van en `backoffice.iso-spec.ts`.
 */
describe('aislamiento de la restauración de Soporte (011b CA-15)', () => {
  let world: IsolationWorld;
  let testApp: TestApp;
  let owner: DataSource;
  let runner: ITransactionRunner;
  let context: TransactionContext;
  let a: WorldAccount;
  let b: WorldAccount;
  let support: WorldAccount;
  let supportActor: Actor;

  const clientActor = (account: WorldAccount): Actor => createActor(account.id, Role.CLIENT);

  const authorized = (call: Test, account: WorldAccount): Test =>
    call.set('Authorization', `Bearer ${world.tokenFor(account)}`);

  const restore = (who: WorldAccount, nodeId: string, client: WorldAccount, type: string): Test =>
    authorized(
      request(testApp.app.getHttpServer())
        .post(`${TRASH}/${nodeId}/restore`)
        .send({ email: client.email, note: NOTE, type }),
      who,
    );

  const listTrash = (who: WorldAccount, client: WorldAccount): Test =>
    authorized(
      request(testApp.app.getHttpServer()).get(TRASH).query({ email: client.email, limit: '100' }),
      who,
    );

  const asActor = (actor: Actor, sql: string, params: unknown[] = []): Promise<unknown[]> =>
    runner.withActor(actor, () => context.requireActorScope(actor).query(sql, params)) as Promise<
      unknown[]
    >;

  /** Una sentencia que la política rechaza con error vale tanto como una que no toca filas: lo que importa es el estado. */
  const attempt = async (actor: Actor, sql: string, params: unknown[] = []): Promise<void> => {
    try {
      await asActor(actor, sql, params);
    } catch (error: unknown) {
      if (!DENIED.test(String(error))) throw error;
    }
  };

  const rows = async (sql: string, params: unknown[]): Promise<unknown[]> =>
    (await owner.query(sql, params)) as unknown[];

  const rowOf = async (table: 'archivo' | 'carpeta', id: string): Promise<AuditedRow> =>
    (
      (await rows(`SELECT to_jsonb(t) AS fila FROM ${table} t WHERE id = $1`, [id])) as AuditedRow[]
    )[0] as AuditedRow;

  /** Todo lo de una cuenta que la restauración podría tocar o que Soporte no debe poder tocar. */
  const snapshotOf = (ownerId: string): Promise<unknown[][]> =>
    Promise.all([
      rows('SELECT to_jsonb(t) AS fila FROM archivo t WHERE propietario_id = $1 ORDER BY id', [
        ownerId,
      ]),
      rows('SELECT to_jsonb(t) AS fila FROM carpeta t WHERE propietario_id = $1 ORDER BY id', [
        ownerId,
      ]),
      rows(
        `SELECT to_jsonb(v) AS fila FROM version_archivo v
          WHERE archivo_id IN (SELECT id FROM archivo WHERE propietario_id = $1) ORDER BY v.id`,
        [ownerId],
      ),
      rows('SELECT to_jsonb(c) AS fila FROM carga c WHERE propietario_id = $1 ORDER BY c.id', [
        ownerId,
      ]),
    ]);

  const eventCount = async (action: string): Promise<number> =>
    (
      (await rows(
        'SELECT count(*)::int AS total FROM evento_auditoria WHERE accion = $1 AND usuario_afectado_id = ANY($2)',
        [action, [a.id, b.id]],
      )) as { total: number }[]
    )[0]?.total ?? 0;

  /** Nombre único: el mundo se comparte entre pruebas y dos archivos vivos no pueden llamarse igual. */
  let fileSeq = 0;
  const file = async (account: WorldAccount, options: FileRowOptions = {}): Promise<string> =>
    (
      await owner.transaction((manager) =>
        insertFileWithVersion(manager, account.id, {
          name: `acta-${(fileSeq += 1)}.txt`,
          ...options,
        }),
      )
    ).fileId;

  const trashedFile = (account: WorldAccount, dates: TrashDates = inForce()): Promise<string> =>
    file(account, dates);

  const trashedTree = async (
    account: WorldAccount,
    parent: FolderRow | null = null,
  ): Promise<Tree> => {
    const dates = inForce();
    const root = await insertFolder(owner, account.id, { name: 'Proyecto', parent, ...dates });
    const carried = { ...dates, trashedWithFolderId: root.id };
    const child = await insertFolder(owner, account.id, {
      name: 'Anexos',
      parent: root,
      ...carried,
    });
    const fileId = await file(account, { folderId: child.id, ...carried });
    return { root, child, fileId };
  };

  /** Las carpetas de una cuenta cuya `ruta` o `profundidad` no cuadran con su padre (plan §6 caso 8). */
  const brokenPaths = async (ownerId: string): Promise<string[]> =>
    (
      (await rows(
        `SELECT c.id, c.ruta, c.profundidad, p.ruta AS padre_ruta
         FROM carpeta c LEFT JOIN carpeta p ON p.id = c.carpeta_padre_id WHERE c.propietario_id = $1`,
        [ownerId],
      )) as PathRow[]
    )
      .filter(
        (row) =>
          row.ruta !== `${row.padre_ruta ?? '/'}${row.id}/` ||
          row.profundidad !== row.ruta.split('/').length - 2,
      )
      .map((row) => row.id);

  const restoredBody = (response: Response): RestoreResponse => {
    expect(response.status).toBe(200);
    return restoreResponseSchema.parse(response.body);
  };

  const errorOf = (response: Response): { status: number; code: unknown } => ({
    status: response.status,
    code: (response.body as { code?: unknown }).code,
  });

  const myEvents = async (account: WorldAccount): Promise<AuditEventResponse[]> => {
    const response = await authorized(request(testApp.app.getHttpServer()).get(MY_EVENTS), account);
    expect(response.status).toBe(200);
    return listAuditEventsResponseSchema.parse(response.body).items;
  };

  beforeAll(async () => {
    world = await createIsolationWorld();
    testApp = await createFullApiTestApp(buildTestEnv(world.appComposition().env));
    owner = await connectAsOwner();
    runner = testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER, { strict: false });
    context = testApp.app.get(TransactionContext, { strict: false });
    [a, b] = world.clients;
    support = world.internals[Role.SUPPORT];
    supportActor = createActor(support.id, Role.SUPPORT);
    await world.withUploads(testApp, a, 1);
    await world.withUploads(testApp, b, 1);
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.destroy();
    await world?.close();
  });

  it('ISO-14 (plan §6 caso 1): con el correo de A, Soporte no puede restaurar un nodo de B: el mismo 404 que un id inexistente, B intacto y sin evento', async () => {
    const mine = await trashedFile(a);
    const theirs = await trashedFile(b);
    const beforeB = await snapshotOf(b.id);
    const events = await eventCount(AuditAction.NODE_RESTORED);

    const crossed = await restore(support, theirs, a, 'file');
    const unknown = await restore(support, randomUUID(), a, 'file');
    const reversed = await restore(support, mine, b, 'file');

    expect(errorOf(crossed)).toEqual(NOT_FOUND);
    expect(comparable(crossed)).toEqual(comparable(unknown));
    expect(errorOf(reversed)).toEqual(NOT_FOUND);
    expect((await rowOf('archivo', theirs)).fila.eliminado_en).not.toBeNull();
    expect((await rowOf('archivo', mine)).fila.eliminado_en).not.toBeNull();
    expect(await snapshotOf(b.id)).toEqual(beforeB);
    expect(await eventCount(AuditAction.NODE_RESTORED)).toBe(events);
    // Centinela: con el correo de A y un nodo de A, la misma ruta sí restaura.
    restoredBody(await restore(support, mine, a, 'file'));
    expect(await eventCount(AuditAction.NODE_RESTORED)).toBe(events + 1);
    expect(await snapshotOf(b.id)).toEqual(beforeB);
  });

  it('ISO-14 (CA-10, CA-15): la papelera que Soporte abre con el correo de A solo trae raíces de A, nunca de B', async () => {
    const mine = await trashedFile(a);
    const theirs = await trashedFile(b);

    const response = await listTrash(support, a);

    expect(response.status).toBe(200);
    const ids = (response.body as { items: { id: string }[] }).items.map((item) => item.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
    const ownedByB = (await rows('SELECT id FROM archivo WHERE propietario_id = $1', [b.id])) as {
      id: string;
    }[];
    expect(ids.filter((id) => ownedByB.some((row) => row.id === id))).toEqual([]);
  });

  it('ISO-15 (plan §6 caso 2): por SQL directo Soporte no puede cambiar ninguna columna de un archivo ni de una carpeta en la papelera', async () => {
    const trashed = await trashedFile(a);
    const tree = await trashedTree(a);
    const destination = await insertFolder(owner, a.id, { name: 'Destino' });
    const beforeFile = await rowOf('archivo', trashed);
    const kind = FILE_KINDS.find((candidate) => candidate !== beforeFile.fila.tipo) ?? 'docx';
    const later = new Date(Date.now() + 99 * DAY_MS);
    const fileAssignments: [string, unknown][] = [
      ['propietario_id', b.id],
      ['version_actual_id', randomUUID()],
      ['tamano_bytes', '1'],
      ['tipo', kind],
      ['carpeta_id', destination.id],
      ['purgar_en', later],
      ['nombre', 'robado.txt'],
    ];
    const folderAssignments: [string, unknown][] = [
      ['propietario_id', b.id],
      ['carpeta_padre_id', destination.id],
      ['ruta', '/forjada/'],
      ['profundidad', 7],
      ['purgar_en', later],
      ['nombre', 'robada'],
    ];
    const beforeFolder = await rowOf('carpeta', tree.root.id);

    for (const [column, value] of fileAssignments) {
      await attempt(supportActor, `UPDATE archivo SET ${column} = $2 WHERE id = $1`, [
        trashed,
        value,
      ]);
    }
    for (const [column, value] of folderAssignments) {
      await attempt(supportActor, `UPDATE carpeta SET ${column} = $2 WHERE id = $1`, [
        tree.root.id,
        value,
      ]);
    }
    // Sacar el nodo de la papelera a mano es restaurar sin pasar por la función.
    await attempt(
      supportActor,
      'UPDATE archivo SET eliminado_en = NULL, purgar_en = NULL WHERE id = $1',
      [trashed],
    );
    await attempt(
      supportActor,
      'UPDATE carpeta SET eliminado_en = NULL, purgar_en = NULL WHERE id = $1',
      [tree.root.id],
    );

    expect(await rowOf('archivo', trashed)).toEqual(beforeFile);
    expect(await rowOf('carpeta', tree.root.id)).toEqual(beforeFolder);
    // Centinela: el dueño sí cambia su propia carpeta con el mismo SQL.
    await asActor(clientActor(a), 'UPDATE carpeta SET nombre = $2 WHERE id = $1', [
      destination.id,
      'Renombrada',
    ]);
    expect((await rowOf('carpeta', destination.id)).fila.nombre).toBe('Renombrada');
  });

  it('ISO-16 (plan §6 caso 3): Soporte no puede tocar un nodo vivo ni restaurar una raíz vencida, un nodo arrastrado, uno ajeno o de otro tipo', async () => {
    const tree = await trashedTree(a);
    const live = await file(a);
    const root = await trashedFile(a);
    const lapsed = await trashedFile(a, expired());
    const theirs = await trashedFile(b);
    const restoreRow = (ownerId: string, type: string, nodeId: string): Promise<unknown[]> =>
      asActor(supportActor, 'SELECT * FROM restaurar_raiz_papelera($1, $2, $3, $4)', [
        ownerId,
        type,
        nodeId,
        MAX_DEPTH,
      ]);
    const before = { a: await snapshotOf(a.id), b: await snapshotOf(b.id) };

    await attempt(supportActor, 'UPDATE archivo SET nombre = $2 WHERE id = $1', [
      live,
      'tocado.txt',
    ]);
    const results = await Promise.all([
      restoreRow(a.id, 'file', tree.fileId),
      restoreRow(a.id, 'file', live),
      restoreRow(a.id, 'file', lapsed),
      restoreRow(a.id, 'file', theirs),
      restoreRow(b.id, 'file', root),
      restoreRow(a.id, 'folder', root),
      restoreRow(a.id, 'version', root),
    ]);

    expect(results).toEqual(results.map(() => []));
    expect(await snapshotOf(a.id)).toEqual(before.a);
    expect(await snapshotOf(b.id)).toEqual(before.b);
    // Centinela: la misma llamada con una raíz vigente de A devuelve su fila.
    expect(await restoreRow(a.id, 'file', root)).toHaveLength(1);
  });

  it('ISO-17 (plan §6 caso 4): Soporte no puede insertar ni borrar nodos ni leer o tocar versiones y cargas', async () => {
    await trashedFile(a);
    const before = { a: await snapshotOf(a.id), b: await snapshotOf(b.id) };
    const scope = context.requireActorScope.bind(context);
    const planted = (actor: Actor, name: string): Promise<unknown> =>
      runner.withActor(actor, () => insertFolder(scope(actor), a.id, { name }));
    const versionsOf = (ownerId: string): Promise<unknown[]> =>
      rows(
        'SELECT id FROM version_archivo WHERE archivo_id IN (SELECT id FROM archivo WHERE propietario_id = $1)',
        [ownerId],
      );

    await expect(planted(supportActor, 'Plantada')).rejects.toThrow(/row-level security/);
    for (const sql of [
      'DELETE FROM archivo WHERE propietario_id = ANY($1)',
      'DELETE FROM carpeta WHERE propietario_id = ANY($1)',
      'DELETE FROM version_archivo WHERE archivo_id IN (SELECT id FROM archivo WHERE propietario_id = ANY($1))',
      'DELETE FROM carga WHERE propietario_id = ANY($1)',
      "UPDATE version_archivo SET clave_objeto = 'robada' WHERE archivo_id IN (SELECT id FROM archivo WHERE propietario_id = ANY($1))",
      "UPDATE carga SET estado = 'cancelada' WHERE propietario_id = ANY($1)",
    ]) {
      await attempt(supportActor, sql, [[a.id, b.id]]);
    }

    expect(
      await asActor(
        supportActor,
        'SELECT id FROM version_archivo WHERE archivo_id IN (SELECT id FROM archivo WHERE propietario_id = ANY($1))',
        [[a.id, b.id]],
      ),
    ).toEqual([]);
    expect(
      await asActor(supportActor, 'SELECT id FROM carga WHERE propietario_id = ANY($1)', [
        [a.id, b.id],
      ]),
    ).toEqual([]);
    expect(await snapshotOf(a.id)).toEqual(before.a);
    expect(await snapshotOf(b.id)).toEqual(before.b);
    // Centinela: el dueño sí lee sus versiones y sí inserta carpetas con el mismo arnés.
    expect((await versionsOf(a.id)).length).toBeGreaterThan(0);
    await expect(planted(clientActor(a), 'Propia')).resolves.toBeDefined();
  });

  it('ISO-18 (plan §6 caso 5): ADMIN, OPERATOR y los clientes A y B reciben 403 en ambas rutas, sin cambiar la papelera ni dejar eventos', async () => {
    const root = await trashedFile(a);
    const callers = [world.internals[Role.ADMIN], world.internals[Role.OPERATOR], a, b];
    const before = { a: await snapshotOf(a.id), b: await snapshotOf(b.id) };
    const counts = async (): Promise<[number, number]> => [
      await eventCount(AuditAction.NODE_RESTORED),
      await eventCount(AuditAction.CLIENT_FILES_VIEWED),
    ];
    const [restored, viewed] = await counts();

    const responses = await Promise.all(
      callers.flatMap((caller) => [listTrash(caller, a), restore(caller, root, a, 'file')]),
    );

    expect(responses.map(errorOf)).toEqual(responses.map(() => FORBIDDEN));
    expect(await snapshotOf(a.id)).toEqual(before.a);
    expect(await snapshotOf(b.id)).toEqual(before.b);
    expect(await counts()).toEqual([restored, viewed]);
    // Centinela: Soporte sí lista y deja su evento.
    expect((await listTrash(support, a)).status).toBe(200);
    expect(await eventCount(AuditAction.CLIENT_FILES_VIEWED)).toBe(viewed + 1);
  });

  it('ISO-19 (plan §6 caso 8): al restaurar una carpeta dentro de otra, `ruta` y `profundidad` quedan bien en todo el subárbol y B no cambia', async () => {
    const destination = await insertFolder(owner, a.id, { name: 'Clientes' });
    const tree = await trashedTree(a, destination);
    await trashedTree(b);
    const beforeB = await snapshotOf(b.id);

    const body = restoredBody(await restore(support, tree.root.id, a, 'folder'));

    expect(body.outcome).toBe('restored');
    expect(await rowOf('carpeta', tree.root.id)).toMatchObject({
      fila: { ruta: `${destination.path}${tree.root.id}/`, profundidad: 2, eliminado_en: null },
    });
    expect(await rowOf('carpeta', tree.child.id)).toMatchObject({
      fila: {
        ruta: `${destination.path}${tree.root.id}/${tree.child.id}/`,
        profundidad: 3,
        eliminado_en: null,
      },
    });
    expect((await rowOf('archivo', tree.fileId)).fila).toMatchObject({
      eliminado_en: null,
      carpeta_id: tree.child.id,
    });
    expect(await brokenPaths(a.id)).toEqual([]);
    expect(await snapshotOf(b.id)).toEqual(beforeB);
  });

  it('ISO-19 (plan §6 caso 8): si su carpeta original está en la papelera, la carpeta vuelve a la raíz con todo el subárbol reubicado', async () => {
    const gone = await insertFolder(owner, a.id, { name: 'Vieja', ...inForce() });
    const tree = await trashedTree(a, gone);

    const body = restoredBody(await restore(support, tree.root.id, a, 'folder'));

    expect(body.outcome).toBe('moved_to_root');
    expect(await rowOf('carpeta', tree.root.id)).toMatchObject({
      fila: { ruta: `/${tree.root.id}/`, profundidad: 1, carpeta_padre_id: null },
    });
    expect(await rowOf('carpeta', tree.child.id)).toMatchObject({
      fila: { ruta: `/${tree.root.id}/${tree.child.id}/`, profundidad: 2 },
    });
    expect((await rowOf('carpeta', gone.id)).fila.eliminado_en).not.toBeNull();
    expect(await brokenPaths(a.id)).toEqual([]);
  });

  it('ISO-20 (plan §6 caso 9, CA-14): B no ve la restauración de A; A la ve con el motivo y el rol SUPPORT, sin datos del interno', async () => {
    const id = await trashedFile(a);
    const beforeB = await myEvents(b);
    const beforeA = (await myEvents(a)).map((event) => event.id);

    restoredBody(await restore(support, id, a, 'file'));

    const added = (await myEvents(a)).filter((event) => !beforeA.includes(event.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      action: AuditAction.NODE_RESTORED,
      actorRole: Role.SUPPORT,
      origin: 'staff',
      note: NOTE,
    });
    const serialized = JSON.stringify(added);
    expect(
      [support.name, support.email, support.id, b.id, b.email].filter((value) =>
        serialized.includes(value),
      ),
    ).toEqual([]);
    expect(await myEvents(b)).toEqual(beforeB);
  });

  it('ISO-21 (plan §6 caso 10, RN-3): una cuenta en solo lectura recibe la restauración y sigue sin poder subir ni editar', async () => {
    await owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en) VALUES ($1, $2, now(), now())
         ON CONFLICT (usuario_id) DO NOTHING`,
      [a.id, TEAM_ID],
    );
    const setReadOnly = (readOnly: boolean): Promise<unknown> =>
      owner.query(
        'UPDATE suscripcion SET estado = $2, vence_en = $3, iniciado_en = $4 WHERE usuario_id = $1',
        readOnly
          ? [
              a.id,
              'solo_lectura',
              new Date(Date.now() - DAY_MS),
              new Date(Date.now() - 31 * DAY_MS),
            ]
          : [a.id, 'vigente', new Date(Date.now() + 29 * DAY_MS), new Date(Date.now() - DAY_MS)],
      );
    const id = await trashedFile(a);
    await setReadOnly(true);

    try {
      const body = restoredBody(await restore(support, id, a, 'file'));
      const upload = await authorized(
        request(testApp.app.getHttpServer())
          .post('/api/v1/uploads')
          .send({ name: 'nuevo.pdf', sizeBytes: 1024, onConflict: 'ask', folderId: null }),
        a,
      );
      const rename = await authorized(
        request(testApp.app.getHttpServer())
          .patch(`/api/v1/files/${id}`)
          .send({ name: 'otro.txt', onConflict: 'ask' }),
        a,
      );

      expect(body.outcome).toBe('restored');
      expect([upload, rename].map(errorOf)).toEqual([
        { status: 403, code: 'STORAGE_ACCOUNT_READ_ONLY' },
        { status: 403, code: 'STORAGE_ACCOUNT_READ_ONLY' },
      ]);
      expect((await rowOf('archivo', id)).fila).toMatchObject({
        nombre: expect.stringMatching(/^acta-\d+\.txt$/) as unknown,
        eliminado_en: null,
      });
    } finally {
      await setReadOnly(false);
    }
  });

  it('ISO-22 (plan §6 caso 11): la restauración espera el candado de `usuario` de A que también toma la purga, y lo vencido es solo de la purga', async () => {
    const id = await trashedFile(a);
    const lapsed = await trashedFile(a, expired());
    const locker = owner.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();

    try {
      // `FOR NO KEY UPDATE` no choca con las llaves foráneas: solo frena a quien pide `FOR UPDATE` sobre `usuario`.
      await locker.query('SELECT id FROM usuario WHERE id = $1 FOR NO KEY UPDATE', [a.id]);
      let settled = false;
      const pending = Promise.resolve(restore(support, id, a, 'file')).then((response) => {
        settled = true;
        return response;
      });

      await delay(LOCK_WAIT_MS);
      expect(settled).toBe(false);
      await locker.rollbackTransaction();

      restoredBody(await pending);
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }
    expect(errorOf(await restore(support, lapsed, a, 'file'))).toEqual(NOT_FOUND);
    expect((await rowOf('archivo', lapsed)).fila.eliminado_en).not.toBeNull();
  });
});
