import { randomUUID } from 'node:crypto';

import { Role } from '../../../src/shared';
import { insertFileWithVersion } from '../storage/storage-test-db';

import { docxBytes } from './docx-bytes';
import { uploadDocx } from './edited-version-world';
import { contentTokenOf, createEditingHttpApp, PAID_TEST_LIMITS } from './editing-http';
import type { EditingHttpApp } from './editing-http';
import { insertEditSession, insertParticipation } from './editing-test-db';

/** Tope editable de esta suite: los `.docx` de prueba lo caben; uno con relleno de 8 KiB no (CA-21). */
const MAX_DOC_BYTES = 4096;

interface OpenBody {
  readonly sessionId: string | null;
  readonly mode: 'edit' | 'view';
  readonly readOnlyReason: string | null;
  readonly config: { document: { key: string; url: string }; editorConfig: { user: unknown } };
  readonly participants: readonly { userId: string; displayName: string }[];
  readonly editors: number;
  readonly maxEditors: number;
}

/**
 * Apertura del editor y contenido firmado (016 T-03, plan §4) con `StorageModule`, `EditingModule` y Postgres reales
 * como `nimbo_app` (RLS). Lector y coeditor (CA-3, CA-22) no son alcanzables hasta 012: los cubre la política.
 */
describe('abrir un `.docx` en el editor (016 CA-1, CA-2, CA-4, CA-5, CA-7, CA-17, CA-21)', () => {
  let editing: EditingHttpApp;

  beforeAll(async () => {
    editing = await createEditingHttpApp({
      env: { EDITING_MAX_DOC_BYTES: String(MAX_DOC_BYTES) },
    });
  });

  afterAll(async () => {
    await editing?.close();
  });

  beforeEach(() => {
    editing.storage.limits.setLimits(PAID_TEST_LIMITS);
    editing.editor.available = true;
  });

  const storage = () => editing.storage;
  const sessionsOf = (fileId: string) =>
    storage().owner.query<{ id: string; estado: string; abierta_por: string }[]>(
      'SELECT id, estado, abierta_por FROM sesion_edicion WHERE archivo_id = $1',
      [fileId],
    );

  it('CA-1, CA-6: la propietaria con plan de pago abre en edición con su nombre real y queda como participante', async () => {
    const ana = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);

    const response = await editing.open(ana, fileId);

    expect(response.status).toBe(200);
    const body = response.body as OpenBody;
    const [session] = await sessionsOf(fileId);
    expect(body).toMatchObject({
      sessionId: session?.id,
      mode: 'edit',
      readOnlyReason: null,
      documentServerUrl: 'http://docs.nimbo.test',
      participants: [{ userId: ana.id, displayName: 'Ana López' }],
      editors: 1,
      maxEditors: 3,
      lastSaveFailed: false,
    });
    expect(body.config.document.key).toBe(session?.id);
    expect(body.config.editorConfig.user).toEqual({ id: ana.id, name: 'Ana López' });
    expect(session).toMatchObject({ estado: 'activa', abierta_por: ana.id });
    const lines = storage()
      .testApp.logs.lines()
      .filter((line) => line.resourceId === fileId || line.fileId === fileId);
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: 'audit.record',
        action: 'edit.session_opened',
        resourceId: fileId,
        attributes: { sessionId: session?.id },
      }),
    );
    expect(JSON.stringify(lines)).not.toContain('informe-');
    expect(JSON.stringify(lines)).not.toContain(contentTokenOf(body.config));
  });

  it('CA-1: volver a abrir reutiliza la sesión abierta y no duplica la participación', async () => {
    const ana = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);
    const first = (await editing.open(ana, fileId)).body as OpenBody;

    const again = (await editing.open(ana, fileId)).body as OpenBody;

    expect(again.sessionId).toBe(first.sessionId);
    expect(again.editors).toBe(1);
    expect(await sessionsOf(fileId)).toHaveLength(1);
  });

  it('CA-2: un archivo ajeno, inexistente, en la papelera o con id malformado responde como inexistente y no abre sesión', async () => {
    const ana = await storage().newClient();
    const bruno = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);
    const trashed = await storage().owner.transaction((manager) =>
      insertFileWithVersion(manager, ana.id, { deletedAt: new Date() }),
    );

    for (const [client, id] of [
      [bruno, fileId],
      [ana, randomUUID()],
      [ana, trashed.fileId],
      [ana, 'no-es-un-uuid'],
    ] as const) {
      const response = await editing.open(client, id);
      expect(response.status).toBe(404);
      expect((response.body as { code: string }).code).toBe('STORAGE_NODE_NOT_FOUND');
    }
    expect(await sessionsOf(fileId)).toEqual([]);
  });

  it('CA-4: un archivo que no es `.docx` responde `EDITING_UNSUPPORTED_FORMAT` (422)', async () => {
    const ana = await storage().newClient();
    const { fileId } = await storage().owner.transaction((manager) =>
      insertFileWithVersion(manager, ana.id),
    );

    const response = await editing.open(ana, fileId);

    expect(response.status).toBe(422);
    expect((response.body as { code: string }).code).toBe('EDITING_UNSUPPORTED_FORMAT');
    expect(await sessionsOf(fileId)).toEqual([]);
  });

  it('CA-5: con una propietaria sin edición (Personal o vencida) abre en solo lectura y sin sesión', async () => {
    const ana = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);
    storage().limits.setLimits({ ...PAID_TEST_LIMITS, maxEditors: 0 });

    const response = await editing.open(ana, fileId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sessionId: null,
      mode: 'view',
      readOnlyReason: 'EDITING_PLAN_READ_ONLY',
      maxEditors: 0,
    });
    expect((response.body as OpenBody).config.document.key).toMatch(/^v-/);
    expect(await sessionsOf(fileId)).toEqual([]);
  });

  it('CA-7: con el máximo de editores conectados abre en solo lectura y ve quiénes están', async () => {
    const ana = await storage().newClient();
    const bruno = await storage().newClient();
    const { fileId, versionId } = await uploadDocx(storage(), ana);
    const sessionId = await insertEditSession(storage().owner, {
      ownerId: ana.id,
      fileId,
      versionId,
    });
    await insertParticipation(storage().owner, sessionId, bruno.id);
    storage().limits.setLimits({ ...PAID_TEST_LIMITS, maxEditors: 1 });

    const response = await editing.open(ana, fileId);

    expect(response.body).toMatchObject({
      sessionId: null,
      mode: 'view',
      readOnlyReason: 'EDITING_LIMIT_REACHED',
      participants: [{ userId: bruno.id, displayName: 'Ana López' }],
      editors: 1,
      maxEditors: 1,
    });
  });

  it('CA-21: un `.docx` mayor que el tope editable abre en solo lectura', async () => {
    const ana = await storage().newClient();
    const uploaded = await ana.upload('grande.docx', docxBytes(2 * MAX_DOC_BYTES));
    const fileId = (uploaded.body as { file: { id: string } }).file.id;

    const response = await editing.open(ana, fileId);

    expect(response.body).toMatchObject({ mode: 'view', readOnlyReason: 'EDITING_FILE_TOO_LARGE' });
  });

  it('plan §4: con la sesión anterior guardándose responde `EDITING_SAVE_IN_PROGRESS` (409)', async () => {
    const ana = await storage().newClient();
    const { fileId, versionId } = await uploadDocx(storage(), ana);
    await insertEditSession(
      storage().owner,
      { ownerId: ana.id, fileId, versionId },
      { state: 'guardando' },
    );

    const response = await editing.open(ana, fileId);

    expect(response.status).toBe(409);
    expect((response.body as { code: string }).code).toBe('EDITING_SAVE_IN_PROGRESS');
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-17: %s recibe `SHARED_FORBIDDEN` y no se registra participación',
    async (role) => {
      const ana = await storage().newClient();
      const internal = await storage().newClient(role);
      const { fileId } = await uploadDocx(storage(), ana);

      const response = await editing.open(internal, fileId);

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('SHARED_FORBIDDEN');
      expect(await sessionsOf(fileId)).toEqual([]);
    },
  );

  it('CA-1: el enlace de contenido de la sesión entrega el `.docx` vigente, sin caché y como descarga', async () => {
    const ana = await storage().newClient();
    const content = docxBytes(512);
    const uploaded = await ana.upload('contrato.docx', content);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const body = (await editing.open(ana, fileId)).body as OpenBody;

    const response = await editing
      .content(contentTokenOf(body.config))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(Buffer.from(response.body as Buffer)).toEqual(content);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('CA-3: el enlace de solo lectura entrega la versión vigente', async () => {
    const ana = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);
    storage().limits.setLimits({ ...PAID_TEST_LIMITS, maxEditors: 0 });
    const body = (await editing.open(ana, fileId)).body as OpenBody;

    const response = await editing.content(contentTokenOf(body.config));

    expect(response.status).toBe(200);
  });

  it('CA-16: el enlace no vale con la sesión cerrada, alterado o si es otro JWT', async () => {
    const ana = await storage().newClient();
    const { fileId } = await uploadDocx(storage(), ana);
    const body = (await editing.open(ana, fileId)).body as OpenBody;
    const token = contentTokenOf(body.config);

    const tampered = await editing.content(`${token.slice(0, -2)}xx`);
    const wrongType = await editing.content('firma-de-prueba');
    await storage().owner.query(
      "UPDATE sesion_edicion SET estado = 'sin_cambios', finalizada_en = now() WHERE id = $1",
      [body.sessionId],
    );
    const closed = await editing.content(token);

    for (const response of [tampered, wrongType, closed]) {
      expect(response.status).toBe(404);
      expect((response.body as { code: string }).code).toBe('STORAGE_NODE_NOT_FOUND');
    }
  });
});
