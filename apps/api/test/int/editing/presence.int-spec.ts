import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Socket as ClientSocket } from 'socket.io-client';

import { EditSessionService } from '../../../src/modules/editing/application/edit-session.service';
import { I_DOCUMENT_ROOMS, REALTIME_DOCUMENT_LEFT } from '../../../src/modules/realtime';
import type { IDocumentRooms } from '../../../src/modules/realtime';
import { createActor, Role } from '../../../src/shared';
import {
  collectEvents,
  settle,
  SETTLE_MS,
  stopAnsweringPings,
} from '../realtime/realtime-test-app';
import type { StorageClient } from '../storage/storage-http';

import { uploadDocx } from './edited-version-world';
import { createEditingHttpApp, PAID_TEST_LIMITS } from './editing-http';
import type { EditingHttpApp } from './editing-http';
import { insertEditSession, insertParticipation } from './editing-test-db';

const PRESENCE = 'editing.presence';
const ANA = 'Ana López';
const BEA = 'Bea Ruiz';

/** Latido corto: una caída sin cierre se detecta en `PING_INTERVAL_MS + PING_TIMEOUT_MS` (015 RN-9, ≤ 60 s en la app). */
const PING_INTERVAL_MS = 300;
const PING_TIMEOUT_MS = 300;
const HEARTBEAT_DETECTION_MS = PING_INTERVAL_MS + PING_TIMEOUT_MS + 2 * SETTLE_MS;

interface PresenceNotice {
  readonly participants: readonly { userId: string; displayName: string }[];
  readonly editors: number;
  readonly maxEditors: number;
}

/** Un documento de Ana con una sesión abierta y Bea conectada como coeditora en su sala. */
interface CoeditedDocument {
  readonly ana: StorageClient;
  readonly bea: StorageClient;
  readonly fileId: string;
  readonly sessionId: string;
  readonly beaSocket: ClientSocket;
}

/**
 * Presencia por el canal de 015 (016 T-04, plan §4): Socket.IO real, `StorageModule`, `EditingModule` y Postgres
 * reales como `nimbo_app`. Un coeditor no puede abrir antes de 012 (RN-2): Bea entra con su participación sembrada y
 * su conexión admitida con `IDocumentRooms.admit`, que es lo que hará `editing` cuando 012 le dé acceso.
 */
describe('presencia, salida y revocación en vivo (016 CA-6, CA-7, CA-8, CA-16)', () => {
  let editing: EditingHttpApp;

  beforeAll(async () => {
    editing = await createEditingHttpApp({
      realtime: { pingIntervalMs: PING_INTERVAL_MS, pingTimeoutMs: PING_TIMEOUT_MS },
    });
  });

  afterAll(async () => {
    await editing?.close();
  });

  beforeEach(() => {
    editing.storage.limits.setLimits(PAID_TEST_LIMITS);
  });

  const storage = () => editing.storage;

  const rename = async (client: StorageClient, name: string): Promise<void> => {
    await storage().owner.query('UPDATE usuario SET nombre = $1 WHERE id = $2', [name, client.id]);
  };

  const leftAtOf = async (sessionId: string, userId: string): Promise<Date | null> => {
    const [row] = await storage().owner.query<{ salio_en: Date | null }[]>(
      'SELECT salio_en FROM participacion WHERE sesion_edicion_id = $1 AND usuario_id = $2',
      [sessionId, userId],
    );
    return row?.salio_en ?? null;
  };

  const coeditedDocument = async (): Promise<CoeditedDocument> => {
    const ana = await storage().newClient();
    const bea = await storage().newClient();
    await rename(bea, BEA);
    const { fileId, versionId } = await uploadDocx(storage(), ana);
    const sessionId = await insertEditSession(storage().owner, {
      ownerId: ana.id,
      fileId,
      versionId,
    });
    await insertParticipation(storage().owner, sessionId, bea.id);
    const beaSocket = await editing.connect(bea.id);
    const rooms = storage().testApp.app.get<IDocumentRooms>(I_DOCUMENT_ROOMS);
    await rooms.admit(createActor(bea.id, Role.CLIENT), beaSocket.id ?? '', fileId);
    return { ana, bea, fileId, sessionId, beaSocket };
  };

  /** Ana abre el documento desde una pestaña con su conexión al canal en vivo. */
  const anaOpens = async (document: CoeditedDocument): Promise<ClientSocket> => {
    const anaSocket = await editing.connect(document.ana.id);
    const response = await editing.open(document.ana, document.fileId, {
      connectionId: anaSocket.id,
    });
    expect(response.status).toBe(200);
    return anaSocket;
  };

  const presenceOf = (bea: string, ana?: string): PresenceNotice => {
    const participants = [{ userId: bea, displayName: BEA }];
    if (ana !== undefined) participants.push({ userId: ana, displayName: ANA });
    return { participants, editors: participants.length, maxEditors: 3 };
  };

  it('CA-6: al entrar, todos los de la sala ven la lista con los nombres reales y el conteo', async () => {
    const document = await coeditedDocument();
    const seenByBea = collectEvents(document.beaSocket, PRESENCE);

    const anaSocket = await editing.connect(document.ana.id);
    const seenByAna = collectEvents(anaSocket, PRESENCE);
    const response = await editing.open(document.ana, document.fileId, {
      connectionId: anaSocket.id,
    });
    await settle();

    const expected = presenceOf(document.bea.id, document.ana.id);
    expect(response.body).toMatchObject(expected);
    expect(seenByBea).toEqual([expected]);
    expect(seenByAna).toEqual([expected]);
  });

  it('CA-6, CA-7, CA-8: al cerrar la pestaña los demás dejan de verla y su plaza queda libre', async () => {
    const document = await coeditedDocument();
    const anaSocket = await anaOpens(document);
    await settle();
    const seenByBea = collectEvents(document.beaSocket, PRESENCE);

    anaSocket.disconnect();
    await settle();

    expect(seenByBea).toEqual([presenceOf(document.bea.id)]);
    expect(await leftAtOf(document.sessionId, document.ana.id)).toBeInstanceOf(Date);
    expect(await leftAtOf(document.sessionId, document.bea.id)).toBeNull();
  });

  it('CA-8: un corte de red se detecta con el latido de 015 y libera la plaza', async () => {
    const document = await coeditedDocument();
    const anaSocket = await anaOpens(document);
    await settle();
    const seenByBea = collectEvents(document.beaSocket, PRESENCE);

    stopAnsweringPings(anaSocket);
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_DETECTION_MS));

    expect(seenByBea).toEqual([presenceOf(document.bea.id)]);
    expect(await leftAtOf(document.sessionId, document.ana.id)).toBeInstanceOf(Date);
  });

  it('ADR-0019: la misma salida avisada dos veces cierra la participación una sola vez', async () => {
    const document = await coeditedDocument();
    const anaSocket = await anaOpens(document);
    await settle();
    const seenByBea = collectEvents(document.beaSocket, PRESENCE);
    const departure = {
      userId: document.ana.id,
      connectionId: anaSocket.id,
      documentId: document.fileId,
    };
    const emitter = storage().testApp.app.get(EventEmitter2);

    await emitter.emitAsync(REALTIME_DOCUMENT_LEFT, departure);
    const leftAt = await leftAtOf(document.sessionId, document.ana.id);
    await emitter.emitAsync(REALTIME_DOCUMENT_LEFT, departure);
    await settle();

    expect(seenByBea).toEqual([presenceOf(document.bea.id)]);
    expect(await leftAtOf(document.sessionId, document.ana.id)).toEqual(leftAt);
  });

  it('CA-16: al revocar el acceso sale de la sala, deja de recibir avisos y lo escrito se conserva', async () => {
    const document = await coeditedDocument();
    const anaSocket = await anaOpens(document);
    await settle();
    const seenByBea = collectEvents(document.beaSocket, PRESENCE);
    const seenByAna = collectEvents(anaSocket, PRESENCE);
    const sessions = storage().testApp.app.get(EditSessionService);

    await sessions.revokeAccess(createActor(document.ana.id, Role.CLIENT), {
      fileId: document.fileId,
      userId: document.bea.id,
    });
    await editing.open(document.ana, document.fileId, { connectionId: anaSocket.id });
    await settle();

    const anaAlone = {
      participants: [{ userId: document.ana.id, displayName: ANA }],
      editors: 1,
      maxEditors: 3,
    };
    expect(seenByBea).toEqual([]);
    expect(seenByAna).toEqual([anaAlone, anaAlone]);
    expect(editing.editor.dropped).toContainEqual({
      documentKey: document.sessionId,
      userId: document.bea.id,
    });
    expect(await leftAtOf(document.sessionId, document.bea.id)).toBeInstanceOf(Date);
    const [session] = await storage().owner.query<{ estado: string }[]>(
      'SELECT estado FROM sesion_edicion WHERE id = $1',
      [document.sessionId],
    );
    expect(session?.estado).toBe('activa');
  });

  describe('el cuerpo de la apertura (plan §4)', () => {
    it.each([
      ['un id de conexión vacío', { connectionId: '' }],
      ['un nombre visible', { displayName: BEA }],
    ])('rechaza %s con `EDITING_INVALID_REQUEST` (400) y no abre sesión', async (_, body) => {
      const ana = await storage().newClient();
      const { fileId } = await uploadDocx(storage(), ana);

      const response = await editing.open(ana, fileId, body);

      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe('EDITING_INVALID_REQUEST');
      expect(
        await storage().owner.query('SELECT 1 FROM sesion_edicion WHERE archivo_id = $1', [fileId]),
      ).toEqual([]);
    });

    it.each([
      ['de otra cuenta', async (other: StorageClient) => (await editing.connect(other.id)).id],
      ['inexistente', () => Promise.resolve('conexion-que-no-existe')],
    ])(
      'una conexión %s responde `SHARED_FORBIDDEN` y no da de alta participación',
      async (_, connectionOf) => {
        const ana = await storage().newClient();
        const other = await storage().newClient();
        const { fileId } = await uploadDocx(storage(), ana);

        const response = await editing.open(ana, fileId, {
          connectionId: await connectionOf(other),
        });

        expect(response.status).toBe(403);
        expect((response.body as { code: string }).code).toBe('SHARED_FORBIDDEN');
        expect(
          await storage().owner.query('SELECT 1 FROM sesion_edicion WHERE archivo_id = $1', [
            fileId,
          ]),
        ).toEqual([]);
      },
    );
  });
});
