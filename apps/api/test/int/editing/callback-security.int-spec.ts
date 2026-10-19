import type { Socket as ClientSocket } from 'socket.io-client';

import { collectEvents, settle } from '../realtime/realtime-test-app';
import { waitForLog } from '../setup/wait-for-log';
import type { StorageClient } from '../storage/storage-http';

import { docxBytes } from './docx-bytes';
import { uploadDocx } from './edited-version-world';
import {
  callbackUrlOf,
  contentTokenOf,
  createEditingHttpApp,
  ONLYOFFICE_TEST_ENV,
} from './editing-http';
import type { CallbackBody, CallbackSigning, EditingHttpApp } from './editing-http';
import { insertParticipation } from './editing-test-db';
import { FakeOnlyOfficeServer } from './fake-onlyoffice-server';

const READY_FOR_SAVING = 2;
const EDITOR_ERROR = 3;
const CLOSED_WITHOUT_CHANGES = 4;
/** Intentos de la cola `editing-save` (plan §4): la sesión falla por almacenamiento solo tras el último. */
const SAVE_ATTEMPTS = 3;
/** Bytes que se le quitan a un `.docx` para entregarlo incompleto (sin el directorio central del ZIP). */
const TRUNCATED_BYTES = 120;
const ACK = { error: 0 };
const REJECTED = { error: 1 };

interface OpenedSession {
  readonly fileId: string;
  readonly sessionId: string;
  readonly callbackUrl: string;
  readonly contentToken: string;
}

/** Un JWT sin firma (`alg: none`) con el aviso como payload. */
const unsignedToken = (body: CallbackBody): string =>
  `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
    JSON.stringify(body),
  ).toString('base64url')}.`;

/**
 * Seguridad del aviso de guardado (016 T-05, CA-19; plan §4 y §5): firma de ONLYOFFICE (HS256 fijo), enlace firmado
 * de `callbackUrl` atado a la sesión, y descarga solo desde un origen del servidor de documentos, sin redirecciones.
 * Nada se descarga ni cambia si algo no vale. Guardado fallido (T-06, CA-14): archivo íntegro o nada, la sesión
 * `fallida` con su motivo, el aviso `editing.save-failed` a cada usuario y el banner al reabrir.
 */
describe('aviso de guardado falsificado o fuera del servicio de edición (016 CA-19)', () => {
  let onlyOffice: FakeOnlyOfficeServer;
  let elsewhere: FakeOnlyOfficeServer;
  let editing: EditingHttpApp;

  beforeAll(async () => {
    onlyOffice = await FakeOnlyOfficeServer.start();
    elsewhere = await FakeOnlyOfficeServer.start();
    editing = await createEditingHttpApp({ onlyOffice });
  });

  afterAll(async () => {
    await editing?.close();
    await onlyOffice?.close();
    await elsewhere?.close();
  });

  const storage = () => editing.storage;

  const openedDocument = async (client: StorageClient): Promise<OpenedSession> => {
    const { fileId } = await uploadDocx(storage(), client);
    const response = await editing.open(client, fileId);
    const opened = response.body as { sessionId: string; config: unknown };
    return {
      fileId,
      sessionId: opened.sessionId,
      callbackUrl: callbackUrlOf(opened.config),
      contentToken: contentTokenOf(opened.config),
    };
  };

  const stateOf = async (sessionId: string): Promise<string | undefined> => {
    const [row] = await storage().owner.query<{ estado: string }[]>(
      'SELECT estado FROM sesion_edicion WHERE id = $1',
      [sessionId],
    );
    return row?.estado;
  };

  const outcomeOf = async (sessionId: string) => {
    const [row] = await storage().owner.query<{ estado: string; motivo_fallo: string | null }[]>(
      'SELECT estado, motivo_fallo FROM sesion_edicion WHERE id = $1',
      [sessionId],
    );
    return row;
  };

  const failedLog = (sessionId: string) =>
    waitForLog(
      storage().testApp.logs,
      (line) => line.event === 'editing.save_failed' && line.sessionId === sessionId,
    );

  const originsOf = async (fileId: string): Promise<string[]> => {
    const rows = await storage().owner.query<{ origen: string }[]>(
      'SELECT origen FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [fileId],
    );
    return rows.map((row) => row.origen);
  };

  const readyBody = (session: OpenedSession, url: string): CallbackBody => ({
    key: session.sessionId,
    status: READY_FOR_SAVING,
    url,
    users: [],
  });

  it.each<[string, CallbackSigning]>([
    ['firmado con otra clave', { secret: `${ONLYOFFICE_TEST_ENV.ONLYOFFICE_JWT_SECRET}-otra` }],
    ['firmado con otro algoritmo (HS512)', { algorithm: 'HS512' }],
  ])(
    'CA-19: un aviso %s responde `{"error":1}` sin descargar ni cambiar nada',
    async (_case, signing) => {
      const ana = await storage().newClient();
      const session = await openedDocument(ana);
      const url = onlyOffice.serve(docxBytes());

      const response = await editing.callback(
        session.callbackUrl,
        readyBody(session, url),
        signing,
      );
      await settle();

      expect(response.status).toBe(200);
      expect(response.body).toEqual(REJECTED);
      expect(await stateOf(session.sessionId)).toBe('activa');
      expect(await originsOf(session.fileId)).toEqual(['carga']);
      expect(onlyOffice.downloads).not.toContain(new URL(url).pathname);
    },
  );

  it('CA-19: un aviso sin firma (`alg: none`) o sin token responde `{"error":1}`', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    const body = readyBody(session, onlyOffice.serve(docxBytes()));

    const unsigned = await editing.rawCallback(session.callbackUrl, {
      ...body,
      token: unsignedToken(body),
    });
    const tokenless = await editing.rawCallback(session.callbackUrl, body);

    expect([unsigned.body, tokenless.body]).toEqual([REJECTED, REJECTED]);
    expect(await stateOf(session.sessionId)).toBe('activa');
  });

  it('CA-19: el enlace de `callbackUrl` de otra sesión, alterado o de contenido responde `{"error":1}`', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    const other = await openedDocument(ana);
    const body = readyBody(session, onlyOffice.serve(docxBytes()));
    const withLink = (link: string): string => {
      const url = new URL(session.callbackUrl);
      url.searchParams.set('link', link);
      return url.toString();
    };
    const linkOf = (callbackUrl: string): string =>
      new URL(callbackUrl).searchParams.get('link') ?? '';

    const responses = await Promise.all([
      editing.callback(other.callbackUrl, body),
      editing.callback(withLink(`${linkOf(session.callbackUrl)}x`), body),
      editing.callback(withLink(session.contentToken), body),
      editing.callback(withLink(''), body),
    ]);
    await settle();

    expect(responses.map((response) => response.body)).toEqual([
      REJECTED,
      REJECTED,
      REJECTED,
      REJECTED,
    ]);
    expect(await stateOf(session.sessionId)).toBe('activa');
    expect(await stateOf(other.sessionId)).toBe('activa');
  });

  it.each([
    ['de otro origen', () => elsewhere.serve(docxBytes())],
    [
      'del mismo servidor con otro nombre de host (origen parecido)',
      () => onlyOffice.serve(docxBytes()).replace('127.0.0.1', 'localhost'),
    ],
    ['que redirige a otro origen', () => onlyOffice.redirectTo(elsewhere.serve(docxBytes()))],
  ])(
    'CA-19: con una URL %s no se descarga nada, la versión no cambia y la sesión queda `fallida/integridad`',
    async (_case, urlOf) => {
      const ana = await storage().newClient();
      const session = await openedDocument(ana);
      const before = { own: onlyOffice.downloads.length, other: elsewhere.downloads.length };

      const response = await editing.callback(session.callbackUrl, readyBody(session, urlOf()));
      await failedLog(session.sessionId);

      expect(response.body).toEqual(ACK);
      expect(onlyOffice.downloads).toHaveLength(before.own);
      expect(elsewhere.downloads).toHaveLength(before.other);
      expect(await originsOf(session.fileId)).toEqual(['carga']);
      expect(await outcomeOf(session.sessionId)).toEqual({
        estado: 'fallida',
        motivo_fallo: 'integridad',
      });
    },
  );

  it('CA-19: un aviso de guardado para una sesión que ya no está abierta no encola ni descarga nada', async () => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    await editing.callback(session.callbackUrl, {
      key: session.sessionId,
      status: CLOSED_WITHOUT_CHANGES,
    });
    const url = onlyOffice.serve(docxBytes());

    const response = await editing.callback(session.callbackUrl, readyBody(session, url));
    await settle();

    expect(response.body).toEqual(ACK);
    expect(await stateOf(session.sessionId)).toBe('sin_cambios');
    expect(await editing.queue('editing-save').getJob(session.sessionId)).toBeUndefined();
    expect(onlyOffice.downloads).not.toContain(new URL(url).pathname);
    expect(await originsOf(session.fileId)).toEqual(['carga']);
  });
  describe('guardado fallido: archivo íntegro o nada (016 CA-14)', () => {
    const currentVersionOf = async (fileId: string): Promise<string | undefined> => {
      const [row] = await storage().owner.query<{ version_actual_id: string }[]>(
        'SELECT version_actual_id FROM archivo WHERE id = $1',
        [fileId],
      );
      return row?.version_actual_id;
    };

    const failedNotices = (socket: ClientSocket): unknown[] =>
      collectEvents(socket, 'editing.save-failed');

    const auditedFailures = (fileId: string) =>
      storage()
        .testApp.logs.lines()
        .filter((line) => line.action === 'edit.save_failed' && line.resourceId === fileId);

    const truncatedDocx = (): Buffer => {
      const bytes = docxBytes();
      return bytes.subarray(0, bytes.length - TRUNCATED_BYTES);
    };

    it.each([
      ['corrupto (no es un `.docx`)', () => Buffer.from('esto no es un documento de Word')],
      ['incompleto (cortado)', truncatedDocx],
    ])(
      'CA-14: un archivo %s deja la sesión `fallida/integridad`, la vigente intacta y avisa a cada participante y a la propietaria',
      async (_case, bytesOf) => {
        const ana = await storage().newClient();
        const bea = await storage().newClient();
        const toAna = failedNotices(await editing.connect(ana.id));
        const toBea = failedNotices(await editing.connect(bea.id));
        const session = await openedDocument(ana);
        await insertParticipation(storage().owner, session.sessionId, bea.id);
        const before = await currentVersionOf(session.fileId);

        await editing.callback(
          session.callbackUrl,
          readyBody(session, onlyOffice.serve(bytesOf())),
        );
        await failedLog(session.sessionId);
        await settle();

        expect(await outcomeOf(session.sessionId)).toEqual({
          estado: 'fallida',
          motivo_fallo: 'integridad',
        });
        expect(await currentVersionOf(session.fileId)).toBe(before);
        expect(await originsOf(session.fileId)).toEqual(['carga']);
        const notice = { sessionId: session.sessionId, fileId: session.fileId };
        expect(toAna).toEqual([notice]);
        expect(toBea).toEqual([notice]);
        expect(auditedFailures(session.fileId)).toEqual([
          expect.objectContaining({
            event: 'audit.record',
            attributes: { sessionId: session.sessionId, reason: 'integridad' },
          }),
        ]);
      },
    );

    it('CA-14: el error del editor (estado 3) deja la sesión `fallida/editor` y avisa', async () => {
      const ana = await storage().newClient();
      const notices = failedNotices(await editing.connect(ana.id));
      const session = await openedDocument(ana);

      const response = await editing.callback(session.callbackUrl, {
        key: session.sessionId,
        status: EDITOR_ERROR,
        users: [ana.id],
      });
      await settle();

      expect(response.body).toEqual(ACK);
      expect(await outcomeOf(session.sessionId)).toEqual({
        estado: 'fallida',
        motivo_fallo: 'editor',
      });
      expect(notices).toEqual([{ sessionId: session.sessionId, fileId: session.fileId }]);
      expect(await originsOf(session.fileId)).toEqual(['carga']);
    });

    it('CA-14: con el archivo purgado en plena sesión queda `fallida/archivo_purgado`, hay aviso en vivo y la apertura responde 404 sin banner', async () => {
      const ana = await storage().newClient();
      const notices = failedNotices(await editing.connect(ana.id));
      const session = await openedDocument(ana);
      expect((await ana.trashFile(session.fileId)).status).toBe(200);
      expect((await ana.purgeFile(session.fileId)).status).toBe(200);

      await editing.callback(
        session.callbackUrl,
        readyBody(session, onlyOffice.serve(docxBytes())),
      );
      await failedLog(session.sessionId);
      await settle();
      const reopened = await editing.open(ana, session.fileId);

      expect(await outcomeOf(session.sessionId)).toEqual({
        estado: 'fallida',
        motivo_fallo: 'archivo_purgado',
      });
      expect(notices).toEqual([{ sessionId: session.sessionId, fileId: session.fileId }]);
      expect(reopened.status).toBe(404);
      expect(reopened.body).not.toHaveProperty('lastSaveFailed');
    });

    it('CA-14: al reabrir hay `lastSaveFailed`; «Abrir el editor de nuevo» sigue en la sesión nueva sobre la vigente y el banner desaparece', async () => {
      const ana = await storage().newClient();
      const session = await openedDocument(ana);
      const before = await currentVersionOf(session.fileId);
      const broken = onlyOffice.serve(Buffer.from('roto'));
      await editing.callback(session.callbackUrl, readyBody(session, broken));
      await failedLog(session.sessionId);
      const downloads = onlyOffice.downloads.length;

      const reopened = await editing.open(ana, session.fileId);
      const again = await editing.open(ana, session.fileId);
      await settle();

      const first = reopened.body as { sessionId: string; mode: string; lastSaveFailed: boolean };
      expect(reopened.status).toBe(200);
      expect(first).toMatchObject({ mode: 'edit', lastSaveFailed: true });
      expect(first.sessionId).not.toBe(session.sessionId);
      expect(again.body).toMatchObject({ sessionId: first.sessionId, lastSaveFailed: false });
      expect(await currentVersionOf(session.fileId)).toBe(before);
      expect(onlyOffice.downloads).toHaveLength(downloads);
      expect(await editing.queue('editing-save').getJob(session.sessionId)).toBeUndefined();
    });

    it('CA-14: un fallo transitorio que se recupera al reintentar guarda la versión sin marcar `fallida` ni avisar', async () => {
      const ana = await storage().newClient();
      const notices = failedNotices(await editing.connect(ana.id));
      const session = await openedDocument(ana);
      const url = onlyOffice.serveAfterFailures(docxBytes(), 1);

      await editing.callback(session.callbackUrl, readyBody(session, url));
      await waitForLog(
        storage().testApp.logs,
        (line) => line.event === 'editing.saved' && line.sessionId === session.sessionId,
      );
      await settle();

      expect(await outcomeOf(session.sessionId)).toEqual({ estado: 'cerrada', motivo_fallo: null });
      expect(await originsOf(session.fileId)).toEqual(['carga', 'edicion']);
      expect(notices).toEqual([]);
      expect(auditedFailures(session.fileId)).toEqual([]);
    });

    it('CA-14: solo tras el 3.er intento fallido la sesión queda `fallida/almacenamiento` y se avisa', async () => {
      const ana = await storage().newClient();
      const notices = failedNotices(await editing.connect(ana.id));
      const session = await openedDocument(ana);
      const url = onlyOffice.serveAfterFailures(docxBytes(), SAVE_ATTEMPTS);
      const attemptsOf = () =>
        onlyOffice.downloads.filter((download) => download === new URL(url).pathname).length;

      await editing.callback(session.callbackUrl, readyBody(session, url));
      await waitForLog(storage().testApp.logs, () => attemptsOf() === SAVE_ATTEMPTS - 1);
      const beforeLast = await outcomeOf(session.sessionId);
      await failedLog(session.sessionId);
      await settle();

      expect(beforeLast).toEqual({ estado: 'guardando', motivo_fallo: null });
      expect(attemptsOf()).toBe(SAVE_ATTEMPTS);
      expect(await outcomeOf(session.sessionId)).toEqual({
        estado: 'fallida',
        motivo_fallo: 'almacenamiento',
      });
      expect(notices).toEqual([{ sessionId: session.sessionId, fileId: session.fileId }]);
      expect(await originsOf(session.fileId)).toEqual(['carga']);
    });
  });
});
