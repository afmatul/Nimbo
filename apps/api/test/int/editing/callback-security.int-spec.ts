import { settle } from '../realtime/realtime-test-app';
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
import { FakeOnlyOfficeServer } from './fake-onlyoffice-server';

const READY_FOR_SAVING = 2;
const CLOSED_WITHOUT_CHANGES = 4;
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
 * Nada se descarga ni cambia si algo no vale.
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
  ])('CA-19: con una URL %s no se descarga nada ni cambia la versión', async (_case, urlOf) => {
    const ana = await storage().newClient();
    const session = await openedDocument(ana);
    const before = { own: onlyOffice.downloads.length, other: elsewhere.downloads.length };

    const response = await editing.callback(session.callbackUrl, readyBody(session, urlOf()));
    await waitForLog(
      storage().testApp.logs,
      (line) => line.event === 'editing.save_rejected' && line.sessionId === session.sessionId,
    );

    expect(response.body).toEqual(ACK);
    expect(onlyOffice.downloads).toHaveLength(before.own);
    expect(elsewhere.downloads).toHaveLength(before.other);
    expect(await originsOf(session.fileId)).toEqual(['carga']);
  });

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
});
