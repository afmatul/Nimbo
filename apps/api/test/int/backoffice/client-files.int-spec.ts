import { randomUUID } from 'node:crypto';

import {
  BACKOFFICE_ERROR_CODES,
  clientFilesResponseSchema,
  errorResponseSchema,
} from '@nimbo/contracts';
import type { ClientFilesResponse } from '@nimbo/contracts';
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
  insertUpload,
  removeAccounts,
} from '../storage/storage-test-db';

const CLIENT_FILES = '/api/v1/backoffice/client-files';
const VIEWED = 'client.files_viewed';
const OLDER = new Date('2026-10-01T09:00:00.000Z');
const NEWER = new Date('2026-10-02T09:00:00.000Z');
const TRASHED_AT = new Date('2026-10-03T09:00:00.000Z');

/**
 * Metadatos de un cliente para Soporte y Administración (011 CA-13, RN-1, RN-2; plan §4, §5) contra la API completa
 * (`AppModule`, como `main.ts`), Postgres como `nimbo_app` y tokens reales de `identity`. Las cuentas y sus archivos se
 * siembran como el dueño (*fixtures*).
 */
describe('`GET /backoffice/client-files` (011 CA-13)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const created: string[] = [];
  const ids = { client: '', support: '', admin: '', otherClient: '' };

  const newAccount = async (role: Role): Promise<string> => {
    const id = await insertAccount(owner, role);
    created.push(id);
    return id;
  };

  const emailOf = (id: string): Promise<string> => emailOfAccount(owner, id);

  const asUser = async (id: string, role: Role) => {
    const { token } = await issuer.issueAccessToken({ userId: id, role, sessionId: randomUUID() });
    return (
      query: Record<string, string>,
      correlationId: string = randomUUID(),
    ): Promise<Response> =>
      request(testApp.app.getHttpServer())
        .get(CLIENT_FILES)
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-Id', correlationId);
  };

  const viewedEventsOn = async (clientId: string): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM evento_auditoria WHERE accion = $1 AND usuario_afectado_id = $2',
      [VIEWED, clientId],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  /** Todas las consultas auditadas, de cualquier cuenta: un 404 no debe sumar ninguna. */
  const allViewedEvents = async (): Promise<number> => {
    const rows = (await owner.query(
      'SELECT count(*)::int AS total FROM evento_auditoria WHERE accion = $1',
      [VIEWED],
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
  };

  /** Dos archivos (uno en la papelera, el más reciente) y una carga en curso, que no es un archivo todavía. */
  const seedClientFiles = async (clientId: string): Promise<{ live: string; trashed: string }> => {
    const live = await owner.transaction((manager) =>
      insertFileWithVersion(manager, clientId, { name: 'presupuesto.pdf', sizeBytes: 2048n }),
    );
    const trashed = await owner.transaction((manager) =>
      insertFileWithVersion(manager, clientId, { name: 'informe.pdf', deletedAt: TRASHED_AT }),
    );
    await owner.query('UPDATE archivo SET actualizado_en = $1 WHERE id = $2', [OLDER, live.fileId]);
    await owner.query('UPDATE archivo SET actualizado_en = $1 WHERE id = $2', [
      NEWER,
      trashed.fileId,
    ]);
    await insertUpload(owner, clientId, { state: 'activa' });
    return { live: live.fileId, trashed: trashed.fileId };
  };

  const bodyOf = (response: Response): ClientFilesResponse => {
    expect(response.status).toBe(200);
    return clientFilesResponseSchema.parse(response.body);
  };

  let seeded: { live: string; trashed: string };

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
    ids.client = await newAccount(Role.CLIENT);
    ids.otherClient = await newAccount(Role.CLIENT);
    ids.support = await newAccount(Role.SUPPORT);
    ids.admin = await newAccount(Role.ADMIN);
    seeded = await seedClientFiles(ids.client);
    await seedClientFiles(ids.otherClient);
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, created);
    await owner?.destroy();
  });

  it.each([
    ['Soporte', Role.SUPPORT],
    ['un Administrador', Role.ADMIN],
  ])(
    'CA-13: %s recibe solo los metadatos del cliente, papelera incluida y sin cargas en curso',
    async (_who, role) => {
      const get = await asUser(role === Role.SUPPORT ? ids.support : ids.admin, role);
      const email = await emailOf(ids.client);

      const body = bodyOf(await get({ email }));

      expect(body.client).toEqual({ id: ids.client, fullName: 'Ana López', email });
      expect(body).toMatchObject({ page: 1, pageSize: 10, total: 2 });
      expect(body.items.map((item) => [item.id, item.trashedAt])).toEqual([
        [seeded.trashed, TRASHED_AT.toISOString()],
        [seeded.live, null],
      ]);
      expect(body.items[1]).toMatchObject({
        name: 'presupuesto.pdf',
        kind: 'pdf',
        sizeBytes: '2048',
        updatedAt: OLDER.toISOString(),
      });
    },
  );

  it('RN-2: la consulta se audita sobre la cuenta del cliente, también con una página vacía', async () => {
    const get = await asUser(ids.support, Role.SUPPORT);
    const before = await viewedEventsOn(ids.client);

    const body = bodyOf(await get({ email: await emailOf(ids.client), page: '2' }));

    expect(body.items).toEqual([]);
    expect(await viewedEventsOn(ids.client)).toBe(before + 1);
  });

  it.each([
    ['sin correo', {}, 'email:REQUIRED'],
    ['con un correo inválido', { email: 'ana@' }, 'email:INVALID_EMAIL'],
    ['con una página no válida', { email: 'ana@nimbo.me', page: '0' }, 'page:INVALID_PAGE'],
  ])(
    'plan §4: una consulta %s responde `400 BACKOFFICE_INVALID_QUERY` con el campo y su motivo',
    async (_case, query: Record<string, string>, reason) => {
      const get = await asUser(ids.support, Role.SUPPORT);

      const response = await get(query);

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.code).toBe(BACKOFFICE_ERROR_CODES.INVALID_QUERY);
      expect(body.fields?.map((issue) => `${issue.field}:${issue.reason}`)).toEqual([reason]);
    },
  );

  it('CA-13: un correo inexistente y el de una cuenta interna reciben el mismo `404`, sin auditoría', async () => {
    const get = await asUser(ids.support, Role.SUPPORT);
    const correlationId = randomUUID();
    const eventsBefore = await allViewedEvents();

    const unknown = await get({ email: `nadie-${randomUUID()}@nimbo.me` }, correlationId);
    const internal = await get({ email: await emailOf(ids.admin) }, correlationId);

    expect(unknown.status).toBe(404);
    expect(errorResponseSchema.parse(unknown.body).code).toBe(
      BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND,
    );
    expect({ status: internal.status, body: internal.body }).toEqual({
      status: unknown.status,
      body: unknown.body,
    });
    expect(await allViewedEvents()).toBe(eventsBefore);
  });

  it('RNF-17: un `404` deja la bitácora `backoffice.client_files.not_found` con el actor y sin el correo', async () => {
    const get = await asUser(ids.support, Role.SUPPORT);
    const correlationId = randomUUID();
    const email = `nadie-${randomUUID()}@nimbo.me`;

    expect((await get({ email }, correlationId)).status).toBe(404);

    const lines = testApp.logs.withCorrelationId(correlationId);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'backoffice.client_files.not_found',
          actorId: ids.support,
          actorRole: Role.SUPPORT,
        }),
      ]),
    );
    expect(JSON.stringify(lines)).not.toContain(email);
  });

  it('RNF-17: la bitácora `backoffice.client_files.viewed` no lleva el correo ni nombres de archivo', async () => {
    const get = await asUser(ids.support, Role.SUPPORT);
    const correlationId = randomUUID();
    const email = await emailOf(ids.client);

    bodyOf(await get({ email }, correlationId));

    const lines = testApp.logs.withCorrelationId(correlationId);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'backoffice.client_files.viewed',
          actorId: ids.support,
          clientId: ids.client,
        }),
      ]),
    );
    const serialized = JSON.stringify(lines);
    for (const secret of [email, 'presupuesto.pdf', 'informe.pdf']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
