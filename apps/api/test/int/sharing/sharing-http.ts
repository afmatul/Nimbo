import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';

import { AuditHttpModule } from '../../../src/modules/audit';
import { ShareeDirectoryAdapter, UserDirectoryAdapter } from '../../../src/modules/identity';
import { I_SHAREE_DIRECTORY, SharingModule } from '../../../src/modules/sharing';
import { LinkToken } from '../../../src/modules/sharing/domain/link-token';
import { createStorageHttpApp, insertCommittedFile } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp, StorageHttpOptions } from '../storage/storage-http';

import { insertPublicLink } from './sharing-test-db';

const API_PREFIX = '/api/v1';

/** `IShareeDirectory` real de `identity`, sin montar todo `IdentityModule` (en la app lo enlaza la raíz, DF-84). */
@Global()
@Module({
  providers: [
    UserDirectoryAdapter,
    ShareeDirectoryAdapter,
    { provide: I_SHAREE_DIRECTORY, useExisting: ShareeDirectoryAdapter },
  ],
  exports: [I_SHAREE_DIRECTORY],
})
class TestShareeDirectoryModule {}

/** Las rutas de `sharing` con el token de un cliente (o sin `Authorization` si no tiene). */
export interface SharesClient {
  share(body: Record<string, unknown>): Promise<Response>;
  accessList(query: Record<string, string>): Promise<Response>;
  /** `DELETE /shares/:shareId` (CA-10). */
  revoke(shareId: string): Promise<Response>;
  /** `GET /shares/received` (CA-22). */
  received(): Promise<Response>;
  /** `DELETE /shares/received/:shareId`, Salir (CA-23). */
  leave(shareId: string): Promise<Response>;
}

/** Las rutas del propietario de `/public-links` (013) con el token de un cliente (o sin `Authorization`). */
export interface PublicLinksClient {
  /** `POST /public-links` (CA-1). */
  create(body: Record<string, unknown>): Promise<Response>;
  /** `GET /public-links?fileId` (CA-7). */
  current(query: Record<string, string>): Promise<Response>;
  /** `DELETE /public-links/:linkId` (CA-8). */
  revoke(linkId: string): Promise<Response>;
}

/** Las rutas del visitante de `/public-links` (013): sin `Authorization` salvo que `headers` la traiga (CA-16). */
export interface PublicLinkVisitor {
  /** `POST /public-links/open` (CA-9); el cuerpo va tal cual, también inválido (plan D-4). */
  open(body: unknown): Promise<Response>;
  /** `POST /public-links/download` (CA-10); el cuerpo va tal cual, también inválido (plan D-4). */
  download(body: unknown): Promise<Response>;
}

export interface SharingHttpApp {
  readonly storage: StorageHttpApp;
  sharesOf(client: StorageClient): SharesClient;
  publicLinksOf(client: StorageClient): PublicLinksClient;
  /** Un visitante con cabeceras propias (p. ej. `X-Forwarded-For` o la sesión de alguien). */
  visitor(headers?: Record<string, string>): PublicLinkVisitor;
  /** Correo de una cuenta, leído como el dueño (las *fixtures* lo derivan del id). */
  emailOf(userId: string): Promise<string>;
  /** Cambia el nombre de una cuenta (las *fixtures* las crean todas con el mismo), para distinguir a las personas. */
  rename(userId: string, name: string): Promise<void>;
  /** `GET /audit/my-events` con el token de un cliente: «Mi actividad» (004 CA-7, 013 CA-18). */
  myEvents(client: StorageClient): Promise<Response>;
  /** Eventos de auditoría cuyo afectado es `userId`, en orden. */
  eventsOf(userId: string): Promise<AuditEventRow[]>;
  close(): Promise<void>;
}

export interface AuditEventRow {
  readonly accion: string;
  readonly actor_id: string | null;
  readonly tipo_recurso: string | null;
  readonly recurso_id: string | null;
  readonly atributos: Record<string, unknown>;
  readonly correlation_id: string | null;
}

/**
 * App HTTP de `sharing` para las suites de 012 y 013: la de `storage` (Postgres como `nimbo_app`, Redis real para la tasa,
 * doble de límites del plan para la solo lectura) con `SharingModule.forRoot(env, storage)` sobre **la misma**
 * instancia de `StorageModule`, el directorio real de destinatarios y la ruta de «Mi actividad» (`AuditHttpModule`).
 */
export const createSharingHttpApp = async (
  options: Pick<StorageHttpOptions, 'env' | 'overrides'> = {},
): Promise<SharingHttpApp> => {
  const storage = await createStorageHttpApp({
    ...options,
    modules: [TestShareeDirectoryModule, AuditHttpModule],
    withStorage: (storageModule, env) => [SharingModule.forRoot(env, storageModule)],
  });
  const http = () => request(storage.testApp.app.getHttpServer());
  const authOf = (client: StorageClient): Record<string, string> => {
    const token = storage.tokenOf(client.id);
    return token === undefined ? {} : { Authorization: `Bearer ${token}` };
  };
  const sharesOf = (client: StorageClient): SharesClient => {
    const auth = authOf(client);
    return {
      share: (body) => http().post(`${API_PREFIX}/shares`).set(auth).send(body),
      accessList: (query) => http().get(`${API_PREFIX}/shares`).query(query).set(auth),
      revoke: (shareId) => http().delete(`${API_PREFIX}/shares/${shareId}`).set(auth),
      received: () => http().get(`${API_PREFIX}/shares/received`).set(auth),
      leave: (shareId) => http().delete(`${API_PREFIX}/shares/received/${shareId}`).set(auth),
    };
  };
  const publicLinksOf = (client: StorageClient): PublicLinksClient => {
    const auth = authOf(client);
    return {
      create: (body) => http().post(`${API_PREFIX}/public-links`).set(auth).send(body),
      current: (query) => http().get(`${API_PREFIX}/public-links`).query(query).set(auth),
      revoke: (linkId) => http().delete(`${API_PREFIX}/public-links/${linkId}`).set(auth),
    };
  };
  const visitor = (headers: Record<string, string> = {}): PublicLinkVisitor => {
    const post = (route: string, body: unknown) =>
      http()
        .post(`${API_PREFIX}/public-links/${route}`)
        .set(headers)
        .send(body as object);
    return {
      open: (body) => post('open', body),
      download: (body) => post('download', body),
    };
  };
  return {
    storage,
    sharesOf,
    publicLinksOf,
    visitor,
    myEvents: (client) => http().get(`${API_PREFIX}/audit/my-events`).set(authOf(client)),
    emailOf: async (userId) => {
      const rows = (await storage.owner.query('SELECT correo FROM usuario WHERE id = $1', [
        userId,
      ])) as { correo: string }[];
      const [row] = rows;
      if (row === undefined) throw new Error('La cuenta no existe');
      return row.correo;
    },
    rename: async (userId, name) => {
      await storage.owner.query('UPDATE usuario SET nombre = $2 WHERE id = $1', [userId, name]);
    },
    eventsOf: (userId) =>
      storage.owner.query(
        `SELECT accion, actor_id, tipo_recurso, recurso_id, atributos, correlation_id
           FROM evento_auditoria WHERE usuario_afectado_id = $1 ORDER BY ocurrido_en, id`,
        [userId],
      ),
    close: () => storage.close(),
  };
};

/** Un /64 al azar (dos grupos), para que cada caso o petición cuente con su propia red. */
export const randomNetwork64 = (): string =>
  `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;

/** Un enlace público insertado por la *fixture*, con su archivo y el token en claro que recibe el visitante. */
export interface LinkedFile {
  readonly ownerId: string;
  readonly fileId: string;
  readonly versionId: string;
  readonly linkId: string;
  readonly token: string;
}

/** Un enlace sobre un archivo nuevo de la cuenta, con contraseña si se da su hash Argon2id. */
export const insertLinkedFile = async (
  sharing: SharingHttpApp,
  ownerId: string,
  passwordHash?: string,
): Promise<LinkedFile> => {
  const file = await insertCommittedFile(sharing.storage.owner, ownerId);
  const token = LinkToken.generate();
  const { id } = await insertPublicLink(sharing.storage.owner, {
    ownerId,
    fileId: file.fileId,
    tokenHash: token.hash(),
    ...(passwordHash === undefined ? {} : { passwordHash }),
  });
  return { ownerId, ...file, linkId: id, token: token.toString() };
};

/** `POST /public-links/download` desde un /64 nuevo cada vez: ninguna red llega a su propio bloqueo. */
export const downloadFromNewNetwork = (
  sharing: SharingHttpApp,
  body: Record<string, unknown>,
): Promise<Response> =>
  sharing.visitor({ 'X-Forwarded-For': `${randomNetwork64()}::1` }).download(body);
