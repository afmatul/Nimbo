import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { Response } from 'supertest';

import { CALLBACK_LINK_PARAMETER } from '../../src/modules/editing/application/editing-config';
import { documentRoom, userRoom } from '../../src/modules/realtime/domain/room-names';
import { createActor, I_TRANSACTION_RUNNER, Role, TransactionContext } from '../../src/shared';
import type { Actor, ITransactionRunner } from '../../src/shared';
import { docxBytes } from '../int/editing/docx-bytes';
import {
  callbackUrlOf,
  contentTokenOf,
  createEditingHttpApp,
  ONLYOFFICE_TEST_ENV,
} from '../int/editing/editing-http';
import type { CallbackBody, EditingHttpApp } from '../int/editing/editing-http';
import { FakeOnlyOfficeServer } from '../int/editing/fake-onlyoffice-server';
import { settle, SETTLE_MS } from '../int/realtime/realtime-test-app';
import { waitForLog } from '../int/setup/wait-for-log';
import type { StorageClient } from '../int/storage/storage-http';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';

/** A y B suben un documento con el mismo nombre y casi el mismo contenido (difieren en un byte de relleno). */
const DOCUMENT_NAME = 'Informe trimestral.docx';
const PADDING_A = 1024;
const PADDING_B = 1025;
/** Conexiones simultáneas de B: abrir más no le da acceso a nada más (015 CA-10). */
const CONNECTIONS_OF_B = 3;
const EDITING = 1;
const READY_FOR_SAVING = 2;
const EDITOR_ERROR = 3;
const ACK = { error: 0 };
const REJECTED = { error: 1 };
const FORBIDDEN_ACK = { error: { code: 'SHARED_FORBIDDEN' } };
/** Tipos de los enlaces firmados de `editing` (plan §5); solo para falsificarlos con la clave del arnés. */
const CALLBACK_TYPE = 'nimbo.edit-callback';
const SESSION_CONTENT_TYPE = 'nimbo.edit-content';
const VERSION_CONTENT_TYPE = 'nimbo.view-content';
const CONTENT_LINK_TTL_SECONDS = 300;

/** Un documento abierto en edición por su propietaria, con lo que su navegador recibe en la configuración. */
interface OpenedDocument {
  readonly client: StorageClient;
  readonly fileId: string;
  readonly versionId: string;
  readonly sessionId: string;
  readonly callbackUrl: string;
  readonly contentToken: string;
  readonly configToken: string;
  readonly socket: ClientSocket;
}

/** Todo lo que llega a una conexión, con su evento. */
interface Received {
  readonly event: string;
  readonly payload: unknown;
}

const jwt = new JwtService({});
const signWithHarnessSecret = (claims: Record<string, unknown>): string =>
  jwt.sign(claims, { secret: ONLYOFFICE_TEST_ENV.ONLYOFFICE_JWT_SECRET, algorithm: 'HS256' });

/** El aviso con el JWT de ONLYOFFICE en el cuerpo, firmado con `secret`. */
const signedBody = (body: CallbackBody, secret: string): CallbackBody => ({
  ...body,
  token: jwt.sign({ ...body }, { secret, algorithm: 'HS256' }),
});

/** Cambia el payload de un JWT sin volver a firmarlo (la firma queda la del original). */
const tamperedPayload = (token: string, claims: Record<string, unknown>): string => {
  const [header = '', payload = '', signature = ''] = token.split('.');
  const original = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object;
  const altered = Buffer.from(JSON.stringify({ ...original, ...claims })).toString('base64url');
  return `${header}.${altered}.${signature}`;
};

const withLink = (callbackUrl: string, link: string): string => {
  const url = new URL(callbackUrl);
  url.searchParams.set(CALLBACK_LINK_PARAMETER, link);
  return url.toString();
};

/** Lo que un cliente distingue de un error binario: estado y cuerpo JSON sin `correlationId` (003 CA-11). */
const errorOf = (response: Response): { status: number; body: Record<string, unknown> } => {
  const parsed = JSON.parse((response.body as Buffer).toString('utf8')) as Record<string, unknown>;
  const { correlationId: _ignored, ...body } = parsed;
  return { status: response.status, body };
};

const collectAll = (socket: ClientSocket): Received[] => {
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));
  return received;
};

/** Junta el cuerpo binario (`.docx`) de una respuesta de `supertest`. */
const binary = (response: Response, done: (error: Error | null, body: unknown) => void): void => {
  const stream = response as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

/**
 * Aislamiento de la edición colaborativa (016 T-07; CA-18, CA-19, CA-17; RNF-05, Art. IX). Con el `OnlyOfficeEditor`
 * real (JWT HS256, lista blanca de origen) contra `FakeOnlyOfficeServer`, Postgres como `nimbo_app`, MinIO y el canal
 * en vivo de 015: A y B tienen documentos casi idénticos abiertos en edición; B, con varias conexiones y con todo lo que
 * su navegador recibe (configuración firmada, enlace de contenido, `callbackUrl`), no obtiene presencia, avisos,
 * contenido ni versión de A, y el archivo, la versión vigente, la sesión y la participación de A no cambian. Los casos
 * «firmado con la clave del arnés» suponen la clave filtrada (defensa en profundidad): ni así B actúa sobre A, porque
 * la sesión se relee con la RLS de la cuenta del enlace. Los roles internos no ven filas de `sesion_edicion` ni de
 * `participacion`. Cada prueba tiene su control positivo (A sí recibe lo suyo), para no pasar por no emitir nada.
 */
describe('aislamiento de la edición colaborativa (016 CA-18, CA-19)', () => {
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

  const query = <T>(sql: string, parameters: unknown[]): Promise<T[]> =>
    storage().owner.query<T[]>(sql, parameters);

  const uploadAs = async (client: StorageClient, padding: number) => {
    const uploaded = await client.upload(DOCUMENT_NAME, docxBytes(padding));
    expect(uploaded.status).toBe(200);
    const fileId = (uploaded.body as { file: { id: string } }).file.id;
    const [row] = await query<{ version_actual_id: string }>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [fileId],
    );
    return { fileId, versionId: row?.version_actual_id ?? '' };
  };

  /** La propietaria sube el documento y lo abre en edición desde una pestaña conectada al canal en vivo. */
  const openedBy = async (client: StorageClient, padding: number): Promise<OpenedDocument> => {
    const { fileId, versionId } = await uploadAs(client, padding);
    const socket = await editing.connect(client.id);
    const response = await editing.open(client, fileId, { connectionId: socket.id });
    expect(response.status).toBe(200);
    const opened = response.body as { sessionId: string; config: { token: string } };
    return {
      client,
      fileId,
      versionId,
      sessionId: opened.sessionId,
      callbackUrl: callbackUrlOf(opened.config),
      contentToken: contentTokenOf(opened.config),
      configToken: opened.config.token,
      socket,
    };
  };

  /** A y B con sus documentos abiertos; B suma conexiones hasta `CONNECTIONS_OF_B`. */
  const world = async () => {
    const a = await openedBy(await storage().newClient(), PADDING_A);
    const b = await openedBy(await storage().newClient(), PADDING_B);
    const extra = await Promise.all(
      Array.from({ length: CONNECTIONS_OF_B - 1 }, () => editing.connect(b.client.id)),
    );
    return { a, b, connectionsOfB: [b.socket, ...extra] };
  };

  /** Lo que de A puede cambiar: versión vigente, versiones, sesión y participantes. */
  const snapshotOf = async (document: OpenedDocument) => {
    const [file] = await query<{ version_actual_id: string }>(
      'SELECT version_actual_id FROM archivo WHERE id = $1',
      [document.fileId],
    );
    const versions = await query<{ id: string; origen: string }>(
      'SELECT id, origen FROM version_archivo WHERE archivo_id = $1 ORDER BY numero',
      [document.fileId],
    );
    const [session] = await query<{ estado: string; motivo_fallo: string | null }>(
      'SELECT estado, motivo_fallo FROM sesion_edicion WHERE id = $1',
      [document.sessionId],
    );
    const participants = await query<{ usuario_id: string; salio_en: Date | null }>(
      'SELECT usuario_id, salio_en FROM participacion WHERE sesion_edicion_id = $1 ORDER BY usuario_id',
      [document.sessionId],
    );
    return { current: file?.version_actual_id, versions, session, participants };
  };

  const expectUntouched = async (document: OpenedDocument): Promise<void> => {
    const snapshot = await snapshotOf(document);
    expect(snapshot).toEqual({
      current: document.versionId,
      versions: [{ id: document.versionId, origen: 'carga' }],
      session: { estado: 'activa', motivo_fallo: null },
      participants: [{ usuario_id: document.client.id, salio_en: null }],
    });
    expect(await editing.queue('editing-save').getJob(document.sessionId)).toBeUndefined();
  };

  const readyBody = (sessionId: string, url: string): CallbackBody => ({
    key: sessionId,
    status: READY_FOR_SAVING,
    url,
    users: [],
  });

  const sessionsOf = async (fileId: string): Promise<number> => {
    const [row] = await query<{ total: string }>(
      'SELECT count(*) AS total FROM sesion_edicion WHERE archivo_id = $1',
      [fileId],
    );
    return Number(row?.total ?? 0);
  };

  describe('canal en vivo (CA-18)', () => {
    it('ISO-1 (CA-18): B, con varias conexiones, no puede entrar a `doc:` ni a `user:` de A: SHARED_FORBIDDEN', async () => {
      const { a, connectionsOfB } = await world();

      const acks = await Promise.all(
        connectionsOfB.flatMap((connection) =>
          [documentRoom(a.fileId), userRoom(a.client.id), a.fileId].map((room) =>
            connection.timeout(SETTLE_MS).emitWithAck('room.join', { room }),
          ),
        ),
      );

      expect(acks).toEqual(acks.map(() => FORBIDDEN_ACK));
    });

    it('ISO-2 (CA-18): B no recibe la presencia, el aviso de guardado fallido ni la versión de A; A sí', async () => {
      const { a, b, connectionsOfB } = await world();
      const seenByB = connectionsOfB.map(collectAll);
      const seenByA = collectAll(a.socket);
      await Promise.all(
        connectionsOfB.map((connection) =>
          connection.timeout(SETTLE_MS).emitWithAck('room.join', { room: documentRoom(a.fileId) }),
        ),
      );

      const secondTab = await editing.connect(a.client.id);
      expect(
        (await editing.open(a.client, a.fileId, { connectionId: secondTab.id })).status,
      ).toBe(200);
      await editing.callback(a.callbackUrl, {
        key: a.sessionId,
        status: READY_FOR_SAVING,
        url: onlyOffice.serve(docxBytes(PADDING_A + 7)),
        users: [],
      });
      await waitForLog(
        storage().testApp.logs,
        (line) => line.event === 'editing.saved' && line.sessionId === a.sessionId,
      );
      const reopened = await editing.open(a.client, a.fileId, { connectionId: secondTab.id });
      const failed = reopened.body as { sessionId: string; config: unknown };
      await editing.callback(callbackUrlOf(failed.config), {
        key: failed.sessionId,
        status: EDITOR_ERROR,
        users: [a.client.id],
      });
      await settle();

      expect(seenByB).toEqual(connectionsOfB.map(() => []));
      expect(seenByA.map((received) => received.event)).toEqual(
        expect.arrayContaining(['editing.presence', 'editing.save-failed']),
      );
      const versionsOfB = await query<{ origen: string }>(
        'SELECT origen FROM version_archivo WHERE archivo_id = $1',
        [b.fileId],
      );
      expect(versionsOfB).toEqual([{ origen: 'carga' }]);
    });
  });

  describe('apertura de la sesión de A (CA-18, CA-2)', () => {
    it('ISO-3 (CA-18): B abriendo el documento de A recibe el mismo 404 que un id inexistente y no entra a la sesión ni a la sala', async () => {
      const { a, b, connectionsOfB } = await world();
      const seenByB = connectionsOfB.map(collectAll);

      const foreign = await editing.open(b.client, a.fileId, { connectionId: b.socket.id });
      const bare = await editing.open(b.client, a.fileId);
      const missing = await editing.open(b.client, randomUUID());
      const secondTab = await editing.connect(a.client.id);
      await editing.open(a.client, a.fileId, { connectionId: secondTab.id });
      await settle();

      expect(comparable(foreign)).toEqual(comparable(missing));
      expect(comparable(bare)).toEqual(comparable(missing));
      expect(missing.status).toBe(404);
      expect(JSON.stringify(foreign.body)).not.toContain(a.sessionId);
      expect(seenByB).toEqual(connectionsOfB.map(() => []));
      expect(await sessionsOf(a.fileId)).toBe(1);
      await expectUntouched(a);
    });

    it('ISO-4 (CA-18): B no puede meter una conexión de A en su propio documento: SHARED_FORBIDDEN', async () => {
      const { a, b } = await world();
      const seenByA = collectAll(a.socket);

      const response = await editing.open(b.client, b.fileId, { connectionId: a.socket.id });
      await editing.open(b.client, b.fileId, { connectionId: b.socket.id });
      await settle();

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('SHARED_FORBIDDEN');
      expect(seenByA).toEqual([]);
    });
  });

  describe('contenido por enlace firmado (CA-18)', () => {
    const contentOf = (token: string): Promise<Response> =>
      editing.content(token).buffer(true).parse(binary);

    it('ISO-5 (CA-18): B no obtiene el contenido de A con su enlace alterado, con otro token suyo ni con un enlace falsificado: 404 uniforme', async () => {
      const { a, b } = await world();
      const callbackLinkOfB = new URL(b.callbackUrl).searchParams.get('link') ?? '';
      const now = Math.floor(Date.now() / 1000);
      const forged = (claims: Record<string, unknown>): string =>
        signWithHarnessSecret({ ...claims, iat: now, exp: now + CONTENT_LINK_TTL_SECONDS });

      const own = await contentOf(b.contentToken);
      const attempts = await Promise.all(
        [
          tamperedPayload(b.contentToken, { sid: a.sessionId }),
          tamperedPayload(b.contentToken, { sid: a.sessionId, oid: a.client.id }),
          callbackLinkOfB,
          b.configToken,
          forged({ typ: SESSION_CONTENT_TYPE, sid: a.sessionId, oid: b.client.id }),
          forged({
            typ: VERSION_CONTENT_TYPE,
            fid: a.fileId,
            vid: a.versionId,
            oid: b.client.id,
          }),
          forged({ typ: CALLBACK_TYPE, sid: a.sessionId, oid: b.client.id }),
        ].map(contentOf),
      );
      const unknown = await contentOf(randomUUID());

      expect(own.status).toBe(200);
      expect((own.body as Buffer).equals(docxBytes(PADDING_B))).toBe(true);
      expect(unknown.status).toBe(404);
      expect(attempts.map((response) => response.status)).toEqual(attempts.map(() => 404));
      expect(attempts.map(errorOf)).toEqual(attempts.map(() => errorOf(unknown)));
      await expectUntouched(a);
    });
  });

  describe('avisos de guardado falsificados (CA-18, CA-19)', () => {
    it('ISO-6 (CA-19): un aviso sobre la sesión de A con firma inválida, o firmado con lo que el navegador de B recibe, responde `{"error":1}`', async () => {
      const { a, b } = await world();
      const body = readyBody(a.sessionId, onlyOffice.serve(docxBytes(PADDING_B)));
      const before = onlyOffice.downloads.length;

      const responses = await Promise.all([
        editing.rawCallback(
          b.callbackUrl,
          signedBody(body, `${ONLYOFFICE_TEST_ENV.ONLYOFFICE_JWT_SECRET}-otra`),
        ),
        editing.rawCallback(b.callbackUrl, { ...body, token: b.configToken }),
        editing.rawCallback(b.callbackUrl, { ...body, token: b.contentToken }),
        editing.rawCallback(b.callbackUrl, {
          ...body,
          token: tamperedPayload(b.configToken, body),
        }),
        editing.rawCallback(withLink(b.callbackUrl, b.contentToken), {
          ...body,
          token: b.configToken,
        }),
      ]);
      await settle();

      expect(responses.map((response) => response.body)).toEqual(responses.map(() => REJECTED));
      expect(onlyOffice.downloads).toHaveLength(before);
      await expectUntouched(a);
    });

    it('ISO-7 (CA-19): un aviso con firma válida pero la clave `sid` de A en el `callbackUrl` de B responde `{"error":1}`', async () => {
      const { a, b } = await world();
      const before = onlyOffice.downloads.length;

      const responses = await Promise.all([
        editing.callback(b.callbackUrl, readyBody(a.sessionId, onlyOffice.serve(docxBytes()))),
        editing.callback(b.callbackUrl, {
          key: a.sessionId,
          status: EDITING,
          users: [b.client.id],
        }),
        editing.callback(b.callbackUrl, { key: a.sessionId, status: EDITOR_ERROR }),
      ]);
      await settle();

      expect(responses.map((response) => response.body)).toEqual(responses.map(() => REJECTED));
      expect(onlyOffice.downloads).toHaveLength(before);
      await expectUntouched(a);
    });

    it('ISO-8 (CA-19): el aviso legítimo de B con una URL fuera de la lista blanca no descarga nada y no toca a A', async () => {
      const { a, b } = await world();
      const before = { own: onlyOffice.downloads.length, other: elsewhere.downloads.length };

      const response = await editing.callback(
        b.callbackUrl,
        readyBody(b.sessionId, elsewhere.serve(docxBytes(PADDING_A))),
      );
      await waitForLog(
        storage().testApp.logs,
        (line) => line.event === 'editing.save_failed' && line.sessionId === b.sessionId,
      );

      expect(response.body).toEqual(ACK);
      expect(onlyOffice.downloads).toHaveLength(before.own);
      expect(elsewhere.downloads).toHaveLength(before.other);
      await expectUntouched(a);
    });

    it('ISO-9 (CA-18, CA-19): con un enlace de `callbackUrl` falsificado con `oid` ajeno, nada cambia en A ni en B (la sesión se relee con la RLS del enlace)', async () => {
      const { a, b } = await world();
      const seenByA = collectAll(a.socket);
      const foreignOwner = signWithHarnessSecret({
        typ: CALLBACK_TYPE,
        sid: a.sessionId,
        oid: b.client.id,
      });
      const swappedOwner = signWithHarnessSecret({
        typ: CALLBACK_TYPE,
        sid: b.sessionId,
        oid: a.client.id,
      });
      const before = onlyOffice.downloads.length;

      const responses = await Promise.all([
        editing.callback(
          withLink(b.callbackUrl, foreignOwner),
          readyBody(a.sessionId, onlyOffice.serve(docxBytes(PADDING_B))),
        ),
        editing.callback(withLink(b.callbackUrl, foreignOwner), {
          key: a.sessionId,
          status: EDITING,
          users: [a.client.id, b.client.id],
        }),
        editing.callback(withLink(b.callbackUrl, foreignOwner), {
          key: a.sessionId,
          status: EDITOR_ERROR,
        }),
        editing.callback(
          withLink(b.callbackUrl, swappedOwner),
          readyBody(b.sessionId, onlyOffice.serve(docxBytes(PADDING_A))),
        ),
      ]);
      await settle();

      expect(responses.map((response) => response.body)).toEqual(responses.map(() => ACK));
      expect(onlyOffice.downloads).toHaveLength(before);
      expect(seenByA).toEqual([]);
      await expectUntouched(a);
      await expectUntouched(b);
    });
  });

  describe('roles internos y RLS de `sesion_edicion` y `participacion` (CA-17, CA-18)', () => {
    let runner: ITransactionRunner;
    let context: TransactionContext;

    beforeAll(() => {
      runner = storage().testApp.app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
      context = storage().testApp.app.get(TransactionContext);
    });

    const visibleRows = (actor: Actor, document: OpenedDocument) =>
      runner.withActor(actor, async () => {
        const scope = context.requireActorScope(actor);
        const sessions = (await scope.query(
          'SELECT id FROM sesion_edicion WHERE archivo_id = $1',
          [document.fileId],
        )) as { id: string }[];
        const participations = (await scope.query(
          'SELECT usuario_id FROM participacion WHERE sesion_edicion_id = $1',
          [document.sessionId],
        )) as { usuario_id: string }[];
        return { sessions, participations };
      });

    it.each(INTERNAL_ROLES)(
      'ISO-10 (CA-17): %s no puede abrir el documento de A ni ve filas de `sesion_edicion` ni de `participacion`',
      async (role) => {
        const { a } = await world();
        const internal = await storage().newClient(role);

        const response = await editing.open(internal, a.fileId);
        const seen = await visibleRows(createActor(internal.id, role), a);
        const seenByOwner = await visibleRows(createActor(a.client.id, Role.CLIENT), a);

        expect(response.status).toBe(403);
        expect((response.body as { code: string }).code).toBe('SHARED_FORBIDDEN');
        expect(seen).toEqual({ sessions: [], participations: [] });
        expect(seenByOwner).toEqual({
          sessions: [{ id: a.sessionId }],
          participations: [{ usuario_id: a.client.id }],
        });
        await expectUntouched(a);
      },
    );

    it('ISO-11 (CA-18): B no ve filas de `sesion_edicion` ni de `participacion` de A', async () => {
      const { a, b } = await world();

      expect(await visibleRows(createActor(b.client.id, Role.CLIENT), a)).toEqual({
        sessions: [],
        participations: [],
      });
    });
  });
});
