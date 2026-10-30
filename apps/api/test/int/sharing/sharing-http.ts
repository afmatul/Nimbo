import { Global, Module } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';

import { ShareeDirectoryAdapter, UserDirectoryAdapter } from '../../../src/modules/identity';
import { I_SHAREE_DIRECTORY, SharingModule } from '../../../src/modules/sharing';
import { createStorageHttpApp } from '../storage/storage-http';
import type { StorageClient, StorageHttpApp, StorageHttpOptions } from '../storage/storage-http';

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
}

export interface SharingHttpApp {
  readonly storage: StorageHttpApp;
  sharesOf(client: StorageClient): SharesClient;
  /** Correo de una cuenta, leído como el dueño (las *fixtures* lo derivan del id). */
  emailOf(userId: string): Promise<string>;
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
 * App HTTP de `sharing` para las suites de 012: la de `storage` (Postgres como `nimbo_app`, Redis real para la tasa,
 * doble de límites del plan para la solo lectura) con `SharingModule.forRoot(env, storage)` sobre **la misma**
 * instancia de `StorageModule` y el directorio real de destinatarios.
 */
export const createSharingHttpApp = async (
  options: Pick<StorageHttpOptions, 'env'> = {},
): Promise<SharingHttpApp> => {
  const storage = await createStorageHttpApp({
    ...options,
    modules: [TestShareeDirectoryModule],
    withStorage: (storageModule, env) => [SharingModule.forRoot(env, storageModule)],
  });
  const http = () => request(storage.testApp.app.getHttpServer());
  const sharesOf = (client: StorageClient): SharesClient => {
    const token = storage.tokenOf(client.id);
    const auth: Record<string, string> =
      token === undefined ? {} : { Authorization: `Bearer ${token}` };
    return {
      share: (body) => http().post(`${API_PREFIX}/shares`).set(auth).send(body),
      accessList: (query) => http().get(`${API_PREFIX}/shares`).query(query).set(auth),
    };
  };
  return {
    storage,
    sharesOf,
    emailOf: async (userId) => {
      const rows = (await storage.owner.query('SELECT correo FROM usuario WHERE id = $1', [
        userId,
      ])) as { correo: string }[];
      const [row] = rows;
      if (row === undefined) throw new Error('La cuenta no existe');
      return row.correo;
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
