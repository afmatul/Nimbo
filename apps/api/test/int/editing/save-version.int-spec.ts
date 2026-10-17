import { JwtService } from '@nestjs/jwt';

import { editedVersionIdOf } from '../../../src/modules/editing/domain/edited-version-id';
import { collectEvents, settle } from '../realtime/realtime-test-app';
import { waitForLog } from '../setup/wait-for-log';
import { usedBytesOf } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';

import { docxBytes } from './docx-bytes';
import { uploadDocx } from './edited-version-world';
import { callbackUrlOf, createEditingHttpApp, PAID_TEST_LIMITS } from './editing-http';
import type { EditingHttpApp } from './editing-http';
import { insertParticipation } from './editing-test-db';
import { FakeOnlyOfficeServer } from './fake-onlyoffice-server';

/** Estados del aviso de ONLYOFFICE (`callbackUrl`). */
const EDITING = 1;
const READY_FOR_SAVING = 2;
const CLOSED_WITHOUT_CHANGES = 4;
const FORCE_SAVED = 6;
const ACK = { error: 0 };
const SMALL_QUOTA_BYTES = 8 * 1024;
const EDITED_PADDING_BYTES = 16 * 1024;

interface OpenedSession {
  readonly fileId: string;
  readonly sessionId: string;
  readonly callbackUrl: string;
}

interface VersionRow {
  readonly id: string;
  readonly numero: number;
  readonly origen: string;
  readonly creado_por: string;
  readonly sesion_edicion_id: string | null;
}

/**
 * Guardado firmado de punta a punta (016 T-05, plan §4): el `OnlyOfficeEditor` real contra un doble HTTP de ONLYOFFICE,
 * la cola `editing-save` en Redis con su procesador en el `api`, `StorageModule`, MinIO y Postgres (`nimbo_app`, RLS).
 */
describe('guardado firmado: aviso → cola → versión (016 CA-9 a CA-13, CA-16, CA-20)', () => {
  let onlyOffice: FakeOnlyOfficeServer;
  let editing: EditingHttpApp;

  beforeAll(async () => {
    onlyOffice = await FakeOnlyOfficeServer.start();
    editing = await createEditingHttpApp({ onlyOffice });
  });

  afterAll(async () => {
    await editing?.close();
    await onlyOffice?.close();
  });

  beforeEach(() => {
    editing.storage.limits.setLimits(PAID_TEST_LIMITS);
  });

  const storage = () => editing.storage;

  const openAs = async (
    client: StorageClient,
    fileId: string,
    body?: Record<string, unknown>,
  ): Promise<OpenedSession> => {
    const response = await editing.open(client, fileId, body);
    if (response.status !== 200) throw new Error(`Apertura rechazada: ${String(response.status)}`);
    const opened = response.body as { sessionId: string; config: unknown };
    return { fileId, sessionId: opened.sessionId, callbackUrl: callbackUrlOf(opened.config) };
  };

  const openedDocument = async (client: StorageClient): Promise<OpenedSession> => {
    const { fileId } = await uploadDocx(storage(), client);
    return openAs(client, fileId);
  };

  const ready = (session: OpenedSession, url: string) =>
    editing.callback(session.callbackUrl, {
      key: session.sessionId,
      status: READY_FOR_SAVING,
      url,
      users: [],
    });

  const savedLog = (sessionId: string) =>
    waitForLog(
      storage().testApp.logs,
      (line) => line.event === 'editing.saved' && line.sessionId === sessionId,
    );

  const stateOf = async (sessionId: string): Promise<string | undefined> => {
    const [row] = await storage().owner.query<{ estado: string }[]>(
      'SELECT estado FROM sesion_edicion WHERE id = $1',
      [sessionId],
    );
    return row?.estado;
  };

  const versionRows = (fileId: string): Promise<VersionRow[]> =>
    storage().owner.query<VersionRow[]>(
      `SELECT id, numero, origen, creado_por, sesion_edicion_id FROM version_archivo
        WHERE archivo_id = $1 ORDER BY numero`,
      [fileId],
    );

  const currentVersionOf = async (fileId: string): Promise<string | undefined> => {
    const [row] = await storage().owner.query<{ version_actual_id: string }[]>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return row?.version_actual_id;
  };

  const participantsOf = async (sessionId: string) =>
    storage().owner.query<{ usuario_id: string; salio_en: Date | null }[]>(
      'SELECT usuario_id, salio_en FROM participacion WHERE sesion_edicion_id = $1',
      [sessionId],
    );

  it('CA-9, CA-12: el aviso de estado 2 responde sin procesar en la petición y deja una versión vigente `edicion` con quien abrió, sus autores y la reindexación encolada', async () => {
    const ana = await storage().newClient();
    const bea = await storage().newClient();
    const socket = await editing.connect(ana.id);
    const saved = collectEvents(socket, 'editing.version-saved');
    const { fileId } = await uploadDocx(storage(), ana);
    const session = await openAs(ana, fileId, { connectionId: socket.id });
    await insertParticipation(storage().owner, session.sessionId, bea.id);
    await storage().owner.query(
      'UPDATE participacion SET salio_en = now() WHERE sesion_edicion_id = $1 AND usuario_id = $2',
      [session.sessionId, bea.id],
    );
    const held = onlyOffice.hold(docxBytes(3000));

    const response = await ready(session, held.url);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ACK);
    expect(await stateOf(session.sessionId)).toBe('guardando');
    expect((await versionRows(fileId)).map((row) => row.origen)).toEqual(['carga']);
    held.release();
    await savedLog(session.sessionId);
    const versionId = editedVersionIdOf(session.sessionId);
    expect((await versionRows(fileId))[1]).toEqual({
      id: versionId,
      numero: 2,
      origen: 'edicion',
      creado_por: ana.id,
      sesion_edicion_id: session.sessionId,
    });
    expect(await currentVersionOf(fileId)).toBe(versionId);
    expect(await stateOf(session.sessionId)).toBe('cerrada');
    expect((await participantsOf(session.sessionId)).map((row) => row.usuario_id).sort()).toEqual(
      [ana.id, bea.id].sort(),
    );
    const indexJob = await editing.queue('indexing').getJob(versionId);
    expect(indexJob?.data).toMatchObject({ fileId, versionId });
    await settle();
    expect(saved).toEqual([{ sessionId: session.sessionId }]);
    const lines = storage().testApp.logs.lines();
    expect(lines).toContainEqual(
      expect.objectContaining({
        event: 'audit.record',
        action: 'file.version_created',
        resourceId: fileId,
        attributes: expect.objectContaining({ versionId, sessionId: session.sessionId }),
      }),
    );
    expect(JSON.stringify(lines)).not.toContain(held.url);
    expect(JSON.stringify(lines)).not.toContain('informe-');
  });

  it('CA-10: el mismo aviso dos veces, a la vez o después de guardar, deja una sola versión', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    const url = onlyOffice.serve(docxBytes());

    const twice = await Promise.all([ready(session, url), ready(session, url)]);
    await savedLog(session.sessionId);
    const again = await ready(session, url);
    await settle();

    expect([...twice, again].map((response) => response.body)).toEqual([ACK, ACK, ACK]);
    expect((await versionRows(session.fileId)).map((row) => row.origen)).toEqual([
      'carga',
      'edicion',
    ]);
    const savedLines = storage()
      .testApp.logs.lines()
      .filter((line) => line.event === 'editing.saved' && line.sessionId === session.sessionId);
    expect(savedLines).toHaveLength(1);
  });

  it('CA-11: cerrar sin cambios (4) termina la sesión sin versión; el guardado forzado (6) no crea versión ni la termina', async () => {
    const ana = await storage().newClient();
    const forced = await openedDocument(ana);
    const url = onlyOffice.serve(docxBytes());

    const forceSaved = await editing.callback(forced.callbackUrl, {
      key: forced.sessionId,
      status: FORCE_SAVED,
      url,
      users: [ana.id],
    });
    const closed = await editing.callback(forced.callbackUrl, {
      key: forced.sessionId,
      status: CLOSED_WITHOUT_CHANGES,
    });
    await settle();

    expect([forceSaved.body, closed.body]).toEqual([ACK, ACK]);
    expect(await stateOf(forced.sessionId)).toBe('sin_cambios');
    expect((await versionRows(forced.fileId)).map((row) => row.origen)).toEqual(['carga']);
    expect(onlyOffice.downloads).not.toContain(new URL(url).pathname);
  });

  it('CA-13: la versión que pasa las retenidas poda la más antigua', async () => {
    editing.storage.limits.setLimits({ ...PAID_TEST_LIMITS, retainedVersions: 2 });
    const ana = await storage().newClient();
    const first = await openedDocument(ana);
    await ready(first, onlyOffice.serve(docxBytes()));
    await savedLog(first.sessionId);
    const second = await openAs(ana, first.fileId);

    await ready(second, onlyOffice.serve(docxBytes(2048)));
    await savedLog(second.sessionId);

    await waitForLog(
      storage().testApp.logs,
      (line) => line.action === 'file.version_pruned' && line.resourceId === first.fileId,
    );
    expect((await versionRows(first.fileId)).map((row) => row.numero)).toEqual([2, 3]);
  });

  it('CA-20: sin cuota libre la versión se guarda igual y la carga siguiente responde `STORAGE_QUOTA_EXCEEDED`', async () => {
    editing.storage.limits.setLimits({
      ...PAID_TEST_LIMITS,
      storageQuotaBytes: BigInt(SMALL_QUOTA_BYTES),
    });
    const ana = await storage().newClient();
    const session = await openedDocument(ana);

    await ready(session, onlyOffice.serve(docxBytes(EDITED_PADDING_BYTES)));
    await savedLog(session.sessionId);

    expect(await usedBytesOf(storage().owner, ana.id)).toBeGreaterThan(BigInt(SMALL_QUOTA_BYTES));
    const next = await ana.init({
      name: 'notas.txt',
      sizeBytes: 16,
      onConflict: 'ask',
      folderId: null,
    });
    expect(next.status).toBe(422);
    expect((next.body as { code: string }).code).toBe('STORAGE_QUOTA_EXCEEDED');
  });

  it('CA-16: el aviso de estado 1 revalida el acceso: quien ya no puede editar sale de la sesión y del editor', async () => {
    const ana = await storage().newClient();
    const bea = await storage().newClient();
    const session = await openedDocument(ana);
    await insertParticipation(storage().owner, session.sessionId, bea.id);

    const response = await editing.callback(session.callbackUrl, {
      key: session.sessionId,
      status: EDITING,
      users: [ana.id, bea.id],
    });

    expect(response.body).toEqual(ACK);
    const rows = await participantsOf(session.sessionId);
    expect(rows.find((row) => row.usuario_id === bea.id)?.salio_en).not.toBeNull();
    expect(rows.find((row) => row.usuario_id === ana.id)?.salio_en).toBeNull();
    const drops = onlyOffice.commands.map((command) =>
      new JwtService({}).decode<{ c: string; key: string; users: string[] }>(
        (JSON.parse(command) as { token: string }).token,
      ),
    );
    expect(drops).toContainEqual(
      expect.objectContaining({ c: 'drop', key: session.sessionId, users: [bea.id] }),
    );
    expect(await stateOf(session.sessionId)).toBe('activa');
  });

  it('PD-101: el aviso de estado 1 vuelve a contar a quien sigue en el editor y suelta a quien ya no está', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    await storage().owner.query(
      'UPDATE participacion SET salio_en = now() WHERE sesion_edicion_id = $1',
      [session.sessionId],
    );
    const stillThere = { key: session.sessionId, status: EDITING, users: [ana.id] };

    await editing.callback(session.callbackUrl, stillThere);
    const afterReturn = await participantsOf(session.sessionId);
    await editing.callback(session.callbackUrl, { ...stillThere, users: [] });
    const afterLeaving = await participantsOf(session.sessionId);

    expect(afterReturn).toEqual([{ usuario_id: ana.id, salio_en: null }]);
    expect(afterLeaving[0]?.salio_en).not.toBeNull();
  });

  it('el aviso firmado en la cabecera (`Authorization`, `{ payload }`) también vale', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);

    const response = await editing.callback(
      session.callbackUrl,
      { key: session.sessionId, status: CLOSED_WITHOUT_CHANGES },
      { inHeader: true },
    );

    expect(response.body).toEqual(ACK);
    expect(await stateOf(session.sessionId)).toBe('sin_cambios');
  });
});
