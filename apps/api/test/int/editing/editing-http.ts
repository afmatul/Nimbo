import type { AddressInfo } from 'node:net';

import { getQueueToken } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { Queue } from 'bullmq';
import type { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Response, Test } from 'supertest';

import { AccessModule } from '../../../src/modules/access';
import { EditingModule, I_USER_DIRECTORY } from '../../../src/modules/editing';
import {
  EditorDownloadRejectedError,
  I_DOCUMENT_EDITOR,
} from '../../../src/modules/editing/application/ports/i-document-editor.port';
import type {
  DownloadedDocument,
  EditorSignal,
  IDocumentEditor,
} from '../../../src/modules/editing/application/ports/i-document-editor.port';
import { UserDirectoryAdapter } from '../../../src/modules/identity';
import { RealtimeModule } from '../../../src/modules/realtime';
import {
  REALTIME_CONFIG,
  REALTIME_PING_INTERVAL_MS,
  REALTIME_PING_TIMEOUT_MS,
} from '../../../src/modules/realtime/application/realtime-config';
import type { RealtimeConfig } from '../../../src/modules/realtime/application/realtime-config';
import type { PlanLimits } from '../../../src/modules/storage';
import { Role, SystemClock } from '../../../src/shared';
import { TestAccessTokens } from '../../support/test-access-tokens';
import {
  ALLOWED_ORIGIN,
  connectClient,
  TEST_CONNECT_ATTEMPTS_PER_MINUTE,
  TestAccessTokenVerifierModule,
  waitForConnect,
} from '../realtime/realtime-test-app';
import { createStorageHttpApp, DEFAULT_TEST_LIMITS } from '../storage/storage-http';
import type { StorageHttpApp } from '../storage/storage-http';

import type { FakeOnlyOfficeServer } from './fake-onlyoffice-server';

/** Conexión de prueba con ONLYOFFICE: nadie la llama, el doble de `IDocumentEditor` responde por el servidor. */
export const ONLYOFFICE_TEST_ENV = {
  ONLYOFFICE_JWT_SECRET: 'secreto-de-prueba-de-onlyoffice-con-32-caracteres',
  ONLYOFFICE_PUBLIC_URL: 'http://docs.nimbo.test',
  ONLYOFFICE_INTERNAL_URL: 'http://onlyoffice.interno.test',
  EDITING_CALLBACK_BASE_URL: 'http://api.nimbo.test',
} as const;

/** Plan de pago de prueba con 3 editores (cifras del doble, no del catálogo, RN-3). */
export const PAID_TEST_LIMITS: PlanLimits = { ...DEFAULT_TEST_LIMITS, maxEditors: 3 };

/** Expulsión pedida al editor (CA-16): la clave del documento y la cuenta. */
export interface DroppedUser {
  readonly documentKey: string;
  readonly userId: string;
}

/** Doble de `IDocumentEditor`: firma con una marca fija; la disponibilidad la decide la prueba (CA-15). */
export class FakeDocumentEditor implements IDocumentEditor {
  available = true;
  readonly dropped: DroppedUser[] = [];

  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...config, token: 'firma-de-prueba' };
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  dropUser(documentKey: string, userId: string): Promise<boolean> {
    this.dropped.push({ documentKey, userId });
    return Promise.resolve(true);
  }

  /** Las suites de guardado usan el editor real contra `FakeOnlyOfficeServer`; este doble no acepta avisos. */
  verifyCallback(): EditorSignal | null {
    return null;
  }

  download(): Promise<DownloadedDocument> {
    return Promise.reject(new EditorDownloadRejectedError('untrusted_url'));
  }
}

/** Cómo firma la prueba un aviso de ONLYOFFICE: por defecto, con el secreto del arnés, HS256 y en el cuerpo. */
export interface CallbackSigning {
  readonly secret?: string;
  readonly algorithm?: 'HS256' | 'HS512';
  /** En la cabecera `Authorization` (`{ payload }`), como ONLYOFFICE sin `token` en el cuerpo. */
  readonly inHeader?: boolean;
}

/** El aviso de ONLYOFFICE que la prueba envía (estado, clave, usuarios y URL de descarga). */
export type CallbackBody = Readonly<Record<string, unknown>>;

/** `IUserDirectory` real de `identity`, sin montar todo `IdentityModule` (lo enlaza la raíz en la app). */
@Global()
@Module({
  providers: [
    UserDirectoryAdapter,
    { provide: I_USER_DIRECTORY, useExisting: UserDirectoryAdapter },
  ],
  exports: [I_USER_DIRECTORY],
})
class TestUserDirectoryModule {}

export interface EditingHttpApp {
  readonly storage: StorageHttpApp;
  readonly editor: FakeDocumentEditor;
  /** `POST /files/:fileId/edit-session` con el token de `client` y el cuerpo dado (por defecto, ninguno). */
  open(client: { id: string }, fileId: string, body?: Record<string, unknown>): Promise<Response>;
  /** `GET /editing/content/:token`, sin token de usuario (como ONLYOFFICE). */
  content(token: string): Test;
  /** Abre una conexión aceptada del canal en vivo (015) de la cuenta `userId`. */
  connect(userId: string): Promise<ClientSocket>;
  /** `POST` a la `callbackUrl` de una configuración de editor con el aviso firmado (como ONLYOFFICE). */
  callback(callbackUrl: string, body: CallbackBody, signing?: CallbackSigning): Promise<Response>;
  /** `POST` a la `callbackUrl` con el cuerpo tal cual, sin firmar nada (avisos falsificados). */
  rawCallback(callbackUrl: string, body: CallbackBody): Promise<Response>;
  /** Una cola BullMQ de la app (`editing-save`, `indexing`). */
  queue(name: string): Queue;
  close(): Promise<void>;
}

export interface EditingHttpOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly limits?: PlanLimits;
  /** Sin el doble de `IDocumentEditor`: el real, para probar el `api` sin variables de ONLYOFFICE. */
  readonly realEditor?: boolean;
  /** Cambia campos de `RealtimeConfig` (p. ej. latido corto para CA-8). */
  readonly realtime?: Partial<RealtimeConfig>;
  /** `OnlyOfficeEditor` real contra este doble HTTP de ONLYOFFICE (URL interna = su origen). */
  readonly onlyOffice?: FakeOnlyOfficeServer;
}

const jwt = new JwtService({});

/** El aviso firmado como lo manda ONLYOFFICE: `token` en el cuerpo o `Bearer` con `{ payload }` en la cabecera. */
const signedCallback = (call: Test, body: CallbackBody, signing: CallbackSigning = {}): Test => {
  const options = {
    secret: signing.secret ?? ONLYOFFICE_TEST_ENV.ONLYOFFICE_JWT_SECRET,
    algorithm: signing.algorithm ?? 'HS256',
  };
  if (signing.inHeader === true) {
    return call.set('Authorization', `Bearer ${jwt.sign({ payload: body }, options)}`).send(body);
  }
  return call.send({ ...body, token: jwt.sign({ ...body }, options) });
};

/** Ruta y consulta de la `callbackUrl` absoluta de la configuración. */
const pathOf = (callbackUrl: string): string => {
  const url = new URL(callbackUrl);
  return `${url.pathname}${url.search}`;
};

const editorEnvOf = (options: EditingHttpOptions): Readonly<Record<string, string>> =>
  options.onlyOffice === undefined ? {} : { ONLYOFFICE_INTERNAL_URL: options.onlyOffice.origin };

const realtimeConfig = (config: Partial<RealtimeConfig> = {}): RealtimeConfig => ({
  origins: [ALLOWED_ORIGIN],
  connectAttemptsPerMinute: TEST_CONNECT_ATTEMPTS_PER_MINUTE,
  pingIntervalMs: REALTIME_PING_INTERVAL_MS,
  pingTimeoutMs: REALTIME_PING_TIMEOUT_MS,
  ...config,
});

/**
 * App de integración de `editing` (016 T-03, T-04): `StorageModule` real con su misma instancia en `EditingModule`,
 * `AccessModule`, `IUserDirectory` real, el canal en vivo de 015 escuchando en un puerto efímero, Postgres como
 * `nimbo_app`, MinIO real y dobles de límites y de ONLYOFFICE. Los tokens del canal usan el reloj del sistema (el de
 * `ConnectionLifetime`); los de HTTP, el de `ProbeModule`.
 */
export const createEditingHttpApp = async (
  options: EditingHttpOptions = {},
): Promise<EditingHttpApp> => {
  const editor = new FakeDocumentEditor();
  const clock = new SystemClock();
  const storage = await createStorageHttpApp({
    env: { ...ONLYOFFICE_TEST_ENV, ...editorEnvOf(options), ...options.env },
    limits: options.limits ?? PAID_TEST_LIMITS,
    modules: [AccessModule, TestUserDirectoryModule, EventEmitterModule.forRoot()],
    withStorage: (storageModule, env) => {
      const realtime = RealtimeModule.forRoot(env, TestAccessTokenVerifierModule.withClock(clock));
      return [realtime, EditingModule.forRoot(env, { storage: storageModule, realtime })];
    },
    overrides: [
      { provide: REALTIME_CONFIG, useValue: realtimeConfig(options.realtime) },
      ...(options.realEditor === true || options.onlyOffice !== undefined
        ? []
        : [{ provide: I_DOCUMENT_EDITOR, useValue: editor }]),
    ],
    withRealtime: true,
  });
  const { app } = storage.testApp;
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${String(port)}`;
  const socketTokens = new TestAccessTokens(clock);
  const http = () => request(app.getHttpServer());
  const sockets: ClientSocket[] = [];
  return {
    storage,
    editor,
    open: (client, fileId, body) => {
      const token = storage.tokenOf(client.id);
      const call = http().post(`/api/v1/files/${fileId}/edit-session`);
      const authorized = token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
      return body === undefined ? authorized : authorized.send(body);
    },
    content: (token) => http().get(`/api/v1/editing/content/${token}`),
    connect: async (userId) => {
      const socket = connectClient(url, { token: socketTokens.forRole(Role.CLIENT, userId) });
      sockets.push(socket);
      await waitForConnect(socket);
      return socket;
    },
    callback: (callbackUrl, body, signing) =>
      signedCallback(http().post(pathOf(callbackUrl)), body, signing),
    rawCallback: (callbackUrl, body) => http().post(pathOf(callbackUrl)).send(body),
    queue: (name) => app.get<Queue>(getQueueToken(name)),
    close: async () => {
      sockets.splice(0).forEach((socket) => socket.disconnect());
      await storage.close();
    },
  };
};

/** El token del enlace de contenido de una configuración de editor (`document.url`). */
export const contentTokenOf = (config: unknown): string => {
  const url = (config as { document: { url: string } }).document.url;
  return url.slice(url.lastIndexOf('/') + 1);
};

/** La `callbackUrl` de una configuración de editor en modo edición. */
export const callbackUrlOf = (config: unknown): string =>
  (config as { editorConfig: { callbackUrl: string } }).editorConfig.callbackUrl;
