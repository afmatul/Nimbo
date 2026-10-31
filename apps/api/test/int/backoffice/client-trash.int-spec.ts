import { randomUUID } from 'node:crypto';

import {
  listAuditEventsResponseSchema,
  BACKOFFICE_ERROR_CODES,
  clientTrashResponseSchema,
  errorResponseSchema,
  restoreResponseSchema,
} from '@nimbo/contracts';
import type { ClientTrashResponse, RestoreResponse } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createFullApiTestApp, emailOfAccount } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import {
  insertAccount,
  insertFileWithVersion,
  insertFolder,
  removeAccounts,
} from '../storage/storage-test-db';
import type { FileRowOptions, FolderRow, FolderRowOptions } from '../storage/storage-test-db';

const CLIENT_TRASH = '/api/v1/backoffice/client-trash';
const RESTORED = 'node.restored';
const VIEWED = 'client.files_viewed';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const DAY_MS = 86_400_000;
const MAX_DEPTH = 10;
const NOTE = 'La clienta pidió recuperarlo por teléfono';

/** En la papelera desde hace un día y con retención vigente. */
const inForce = (): Pick<FileRowOptions, 'deletedAt' | 'purgeAt'> => ({
  deletedAt: new Date(Date.now() - DAY_MS),
  purgeAt: new Date(Date.now() + 29 * DAY_MS),
});

interface NodeState {
  readonly nombre: string;
  readonly eliminado_en: Date | null;
}

/**
 * Papelera de un cliente para Soporte (011b CA-10 a CA-14; plan §4, §5) contra la API completa (`AppModule`), Postgres
 * como `nimbo_app` y tokens reales de `identity`. Las *fixtures* se siembran como el dueño. La función
 * `restaurar_raiz_papelera` se prueba a fondo con un dueño sin `SUPERUSER` en `test/int/storage/support-trash.int-spec.ts`;
 * aquí, los endpoints, la auditoría y las bitácoras.
 */
describe('papelera de un cliente para Soporte (011b CA-10 a CA-14)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const created: string[] = [];
  const ids = { client: '', other: '', support: '', admin: '' };
  let email = '';

  const newAccount = async (role: Role): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    return id;
  };

  const tokenOf = async (userId: string, role: Role): Promise<string> =>
    (await issuer.issueAccessToken({ userId, role, sessionId: randomUUID() })).token;

  const http = () => request(testApp.app.getHttpServer());

  const list = async (query: Record<string, string>, correlationId = randomUUID()) =>
    http()
      .get(CLIENT_TRASH)
      .query(query)
      .set('Authorization', `Bearer ${await tokenOf(ids.support, Role.SUPPORT)}`)
      .set('X-Correlation-Id', correlationId);

  const restore = async (nodeId: string, body: object, correlationId = randomUUID()) =>
    http()
      .post(`${CLIENT_TRASH}/${nodeId}/restore`)
      .send(body)
      .set('Authorization', `Bearer ${await tokenOf(ids.support, Role.SUPPORT)}`)
      .set('X-Correlation-Id', correlationId);

  const file = async (ownerId: string, options: FileRowOptions = {}): Promise<string> =>
    (await owner.transaction((manager) => insertFileWithVersion(manager, ownerId, options))).fileId;

  const folder = (ownerId: string, options: FolderRowOptions = {}): Promise<FolderRow> =>
    insertFolder(owner, ownerId, options);

  const stateOf = async (table: 'archivo' | 'carpeta', id: string): Promise<NodeState> => {
    const [row] = (await owner.query(`SELECT nombre, eliminado_en FROM ${table} WHERE id = $1`, [
      id,
    ])) as NodeState[];
    return row as NodeState;
  };

  const countOf = async (action: string, clientId: string): Promise<number> => {
    const [row] = (await owner.query(
      'SELECT count(*)::int AS total FROM evento_auditoria WHERE accion = $1 AND usuario_afectado_id = $2',
      [action, clientId],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  const restoredBody = (response: Response): RestoreResponse => {
    expect(response.status).toBe(200);
    return restoreResponseSchema.parse(response.body);
  };

  const errorOf = (response: Response) => ({
    status: response.status,
    code: errorResponseSchema.parse(response.body).code,
  });

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    ids.client = await newAccount(Role.CLIENT);
    ids.other = await newAccount(Role.CLIENT);
    ids.support = await newAccount(Role.SUPPORT);
    ids.admin = await newAccount(Role.ADMIN);
    email = await emailOfAccount(owner, ids.client);
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  describe('GET /backoffice/client-trash (CA-10, CA-12)', () => {
    const roots = { file: '', folder: '', carried: '', expired: '', live: '' };

    beforeAll(async () => {
      const trashed = inForce();
      const box = await folder(ids.client, { name: 'Contratos', ...trashed });
      roots.folder = box.id;
      roots.carried = await file(ids.client, {
        name: 'dentro.pdf',
        folderId: box.id,
        trashedWithFolderId: box.id,
        sizeBytes: 300n,
        ...trashed,
      });
      roots.file = await file(ids.client, { name: 'suelto.pdf', sizeBytes: 2048n, ...trashed });
      roots.expired = await file(ids.client, {
        deletedAt: new Date(Date.now() - 40 * DAY_MS),
        purgeAt: new Date(Date.now() - DAY_MS),
      });
      roots.live = await file(ids.client);
      await file(ids.other, { name: 'ajeno.pdf', ...inForce() });
    });

    it('CA-10: solo las raíces con retención vigente del cliente, con su tamaño y sin contenido ni URLs', async () => {
      const response = await list({ email });

      expect(response.status).toBe(200);
      const body: ClientTrashResponse = clientTrashResponseSchema.parse(response.body);
      expect(body.client).toEqual({ id: ids.client, fullName: 'Ana López', email });
      expect(body.items.map((item) => [item.type, item.id, item.sizeBytes]).sort()).toEqual(
        [
          ['file', roots.file, 2048],
          ['folder', roots.folder, 300],
        ].sort(),
      );
      expect(body.nextCursor).toBeNull();
    });

    it('CA-10: con `limit` pagina por cursor, más recientes primero', async () => {
      const first = clientTrashResponseSchema.parse((await list({ email, limit: '1' })).body);
      const cursor = first.nextCursor ?? '';

      const second = clientTrashResponseSchema.parse(
        (await list({ email, limit: '1', cursor })).body,
      );

      expect(cursor).not.toBe('');
      expect([...first.items, ...second.items].map((item) => item.id).sort()).toEqual(
        [roots.file, roots.folder].sort(),
      );
      expect(second.nextCursor).toBeNull();
    });

    it('CA-10: la consulta queda en la auditoría del cliente, como la de sus metadatos', async () => {
      const before = await countOf(VIEWED, ids.client);

      expect((await list({ email })).status).toBe(200);

      expect(await countOf(VIEWED, ids.client)).toBe(before + 1);
    });

    it.each([
      ['con el correo vacío', { email: '' }, 'email:REQUIRED'],
      ['con un límite cero', { limit: '0' }, 'limit:INVALID_LIMIT'],
      ['con un límite sobre el máximo', { limit: '101' }, 'limit:INVALID_LIMIT'],
      ['con un cursor vacío', { cursor: '' }, 'cursor:INVALID_CURSOR'],
      ['con un cursor que la API no emitió', { cursor: 'basura' }, 'cursor:INVALID_CURSOR'],
    ])(
      'CA-12: una consulta %s responde `400 BACKOFFICE_INVALID_QUERY` con el campo',
      async (_case, query: Record<string, string>, reason) => {
        const response = await list({ email, ...query });

        expect(response.status).toBe(400);
        const body = errorResponseSchema.parse(response.body);
        expect(body.code).toBe(BACKOFFICE_ERROR_CODES.INVALID_QUERY);
        expect(body.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([reason]);
      },
    );

    it('CA-12: un correo inexistente y el de una cuenta interna dan el mismo `404`, sin auditoría', async () => {
      const correlationId = randomUUID();
      const unknown = await list({ email: `nadie-${randomUUID()}@nimbo.me` }, correlationId);
      const internal = await list({ email: await emailOfAccount(owner, ids.admin) }, correlationId);

      expect(errorOf(unknown)).toEqual({
        status: 404,
        code: BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND,
      });
      expect({ status: internal.status, body: internal.body }).toEqual({
        status: unknown.status,
        body: unknown.body,
      });
      expect(await countOf(VIEWED, ids.admin)).toBe(0);
    });

    it('RNF-17: la bitácora `backoffice.client_trash.viewed` lleva ids, sin correo ni nombres', async () => {
      const correlationId = randomUUID();

      expect((await list({ email }, correlationId)).status).toBe(200);

      const lines = testApp.logs.withCorrelationId(correlationId);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.client_trash.viewed',
            actorId: ids.support,
            clientId: ids.client,
          }),
        ]),
      );
      const serialized = JSON.stringify(lines);
      for (const secret of [email, 'suelto.pdf', 'Contratos', 'dentro.pdf']) {
        expect(serialized).not.toContain(secret);
      }
    });
  });

  describe('POST /backoffice/client-trash/:nodeId/restore (CA-11, CA-12, CA-14)', () => {
    it('CA-11: un archivo vuelve a su carpeta original y responde `restored`', async () => {
      const target = await folder(ids.client, { name: 'Facturas' });
      const id = await file(ids.client, { name: 'marzo.pdf', folderId: target.id, ...inForce() });

      const body = restoredBody(await restore(id, { email, note: NOTE, type: 'file' }));

      expect(body).toMatchObject({ outcome: 'restored', originalName: 'marzo.pdf' });
      expect(body.item).toMatchObject({ type: 'file', id, name: 'marzo.pdf', folderId: target.id });
      expect((await stateOf('archivo', id)).eliminado_en).toBeNull();
    });

    it('CA-11: con un nombre ocupado en el destino responde `renamed` con el primer nombre libre', async () => {
      await file(ids.client, { name: 'acta.pdf' });
      const id = await file(ids.client, { name: 'acta.pdf', ...inForce() });

      const body = restoredBody(await restore(id, { email, note: NOTE, type: 'file' }));

      expect(body).toMatchObject({ outcome: 'renamed', originalName: 'acta.pdf' });
      expect(body.item.name).toBe('acta (1).pdf');
    });

    it('CA-11: si la carpeta original ya no está disponible, la carpeta vuelve a la raíz (`moved_to_root`)', async () => {
      const parent = await folder(ids.client, { name: 'Viejo', ...inForce() });
      const child = await folder(ids.client, { name: 'Hijo', parent, ...inForce() });

      const body = restoredBody(await restore(child.id, { email, note: NOTE, type: 'folder' }));

      expect(body).toMatchObject({ outcome: 'moved_to_root', originalName: 'Hijo' });
      expect(body.item).toMatchObject({ type: 'folder', id: child.id, parentId: null });
    });

    it('CA-14, RN-4: `node.restored` con el motivo, contra el cliente y con el rol de Soporte', async () => {
      const id = await file(ids.client, { sizeBytes: 4096n, ...inForce() });

      restoredBody(await restore(id, { email, note: `  ${NOTE}  `, type: 'file' }));

      const [event] = (await owner.query(
        'SELECT rol_actor, actor_id, tipo_recurso, atributos FROM evento_auditoria WHERE accion = $1 AND recurso_id = $2',
        [RESTORED, id],
      )) as { rol_actor: string; actor_id: string; tipo_recurso: string; atributos: object }[];
      expect(event).toEqual({
        rol_actor: Role.SUPPORT,
        actor_id: ids.support,
        tipo_recurso: 'file',
        atributos: { nodeType: 'file', itemCount: 1, sizeBytes: 4096, note: NOTE },
      });
    });

    it('CA-14: el cliente ve la restauración en «Mi actividad» con el motivo y el rol, sin datos del interno', async () => {
      const id = await file(ids.client, { ...inForce() });
      restoredBody(await restore(id, { email, note: NOTE, type: 'file' }));

      const response = await http()
        .get('/api/v1/audit/my-events')
        .set('Authorization', `Bearer ${await tokenOf(ids.client, Role.CLIENT)}`);

      expect(response.status).toBe(200);
      const events = listAuditEventsResponseSchema.parse(response.body).items;
      expect(events.find((event) => event.action === RESTORED)).toMatchObject({
        origin: 'staff',
        actorRole: Role.SUPPORT,
        note: NOTE,
      });
      expect(JSON.stringify(response.body)).not.toContain(ids.support);
    });

    it('CA-14, RNF-17: la bitácora lleva ids y el resultado con su `correlationId`; nunca motivo, nombre ni correo', async () => {
      const id = await file(ids.client, { name: 'privado.pdf', ...inForce() });
      const correlationId = randomUUID();

      restoredBody(await restore(id, { email, note: NOTE, type: 'file' }, correlationId));

      const lines = testApp.logs.withCorrelationId(correlationId);
      expect(lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'backoffice.client_trash.restored',
            actorId: ids.support,
            clientId: ids.client,
            nodeId: id,
            outcome: 'restored',
          }),
        ]),
      );
      const serialized = JSON.stringify(lines);
      for (const secret of [NOTE, 'privado.pdf', email]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it.each([
      ['un motivo vacío', { note: '   ' }, 'note:NOTE_REQUIRED'],
      ['un motivo de más de 500 caracteres', { note: 'a'.repeat(501) }, 'note:NOTE_TOO_LONG'],
      ['un tipo que no es `file` ni `folder`', { type: 'version' }, 'type:INVALID_NODE_TYPE'],
      ['un correo inválido', { email: 'ana@' }, 'email:INVALID_EMAIL'],
    ])(
      'CA-12: con %s responde `422 BACKOFFICE_INVALID_INPUT`, no restaura ni guarda el motivo',
      async (_case, override, reason) => {
        const id = await file(ids.client, inForce());
        const before = await countOf(RESTORED, ids.client);

        const response = await restore(id, { email, note: NOTE, type: 'file', ...override });

        expect(response.status).toBe(422);
        const body = errorResponseSchema.parse(response.body);
        expect(body.code).toBe(BACKOFFICE_ERROR_CODES.INVALID_INPUT);
        expect(body.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([reason]);
        expect((await stateOf('archivo', id)).eliminado_en).not.toBeNull();
        expect(await countOf(RESTORED, ids.client)).toBe(before);
      },
    );

    it('CA-12: un correo que no es de un cliente es `404 BACKOFFICE_CLIENT_NOT_FOUND` y nada cambia', async () => {
      const id = await file(ids.client, inForce());

      const response = await restore(id, {
        email: `nadie-${randomUUID()}@nimbo.me`,
        note: NOTE,
        type: 'file',
      });

      expect(errorOf(response)).toEqual({
        status: 404,
        code: BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND,
      });
      expect((await stateOf('archivo', id)).eliminado_en).not.toBeNull();
    });

    it('CA-12, CA-15: lo ajeno, lo vencido, lo vivo, lo arrastrado, el tipo cruzado y un id no UUID dan el mismo `404 STORAGE_NODE_NOT_FOUND`', async () => {
      const box = await folder(ids.client, inForce());
      const cases = {
        other: await file(ids.other, inForce()),
        expired: await file(ids.client, {
          deletedAt: new Date(Date.now() - 40 * DAY_MS),
          purgeAt: new Date(Date.now() - DAY_MS),
        }),
        live: await file(ids.client),
        carried: await file(ids.client, {
          folderId: box.id,
          trashedWithFolderId: box.id,
          ...inForce(),
        }),
      };
      const before = await countOf(RESTORED, ids.client);

      const responses = await Promise.all([
        ...Object.values(cases).map((id) => restore(id, { email, note: NOTE, type: 'file' })),
        restore(box.id, { email, note: NOTE, type: 'file' }),
        restore('no-es-uuid', { email, note: NOTE, type: 'file' }),
      ]);

      expect(responses.map(errorOf)).toEqual(
        responses.map(() => ({ status: 404, code: 'STORAGE_NODE_NOT_FOUND' })),
      );
      expect((await stateOf('archivo', cases.other)).eliminado_en).not.toBeNull();
      expect(await countOf(RESTORED, ids.client)).toBe(before);
      expect(await countOf(RESTORED, ids.other)).toBe(0);
    });

    it('CA-12: una carpeta que superaría la profundidad máxima es `422 STORAGE_FOLDER_DEPTH_EXCEEDED` y nada cambia', async () => {
      let parent: FolderRow | null = null;
      for (let level = 1; level <= MAX_DEPTH; level += 1) {
        parent = await folder(ids.client, { parent });
      }
      const deep = await folder(ids.client, { parent, ...inForce() });

      const response = await restore(deep.id, { email, note: NOTE, type: 'folder' });

      expect(errorOf(response)).toEqual({ status: 422, code: 'STORAGE_FOLDER_DEPTH_EXCEEDED' });
      expect((await stateOf('carpeta', deep.id)).eliminado_en).not.toBeNull();
    });

    it('RN-3, CA-11: una cuenta en solo lectura recibe la restauración y sigue sin poder subir', async () => {
      const readOnly = await newAccount(Role.CLIENT);
      await owner.query(
        `INSERT INTO suscripcion (usuario_id, plan_id, estado, iniciado_en, vence_en)
         VALUES ($1, $2, 'solo_lectura', $3, $4)`,
        [readOnly, TEAM_ID, new Date(Date.now() - 31 * DAY_MS), new Date(Date.now() - DAY_MS)],
      );
      const id = await file(readOnly, inForce());

      const restored = await restore(id, {
        email: await emailOfAccount(owner, readOnly),
        note: NOTE,
        type: 'file',
      });
      const upload = await http()
        .post('/api/v1/uploads')
        .set('Authorization', `Bearer ${await tokenOf(readOnly, Role.CLIENT)}`)
        .send({ name: 'nuevo.pdf', sizeBytes: 1024, onConflict: 'ask', folderId: null });

      expect(restoredBody(restored).outcome).toBe('restored');
      expect(errorOf(upload)).toEqual({ status: 403, code: 'STORAGE_ACCOUNT_READ_ONLY' });
    });
  });
});
