import { Global, Module } from '@nestjs/common';
import request from 'supertest';
import type { Response, Test } from 'supertest';

import { AccessModule } from '../../../src/modules/access';
import { EditingModule, I_USER_DIRECTORY } from '../../../src/modules/editing';
import { I_DOCUMENT_EDITOR } from '../../../src/modules/editing/application/ports/i-document-editor.port';
import type { IDocumentEditor } from '../../../src/modules/editing/application/ports/i-document-editor.port';
import { UserDirectoryAdapter } from '../../../src/modules/identity';
import type { PlanLimits } from '../../../src/modules/storage';
import { createStorageHttpApp, DEFAULT_TEST_LIMITS } from '../storage/storage-http';
import type { StorageHttpApp } from '../storage/storage-http';

/** Conexión de prueba con ONLYOFFICE: nadie la llama, el doble de `IDocumentEditor` responde por el servidor. */
export const ONLYOFFICE_TEST_ENV = {
  ONLYOFFICE_JWT_SECRET: 'secreto-de-prueba-de-onlyoffice-con-32-caracteres',
  ONLYOFFICE_PUBLIC_URL: 'http://docs.nimbo.test',
  ONLYOFFICE_INTERNAL_URL: 'http://onlyoffice.interno.test',
  EDITING_CALLBACK_BASE_URL: 'http://api.nimbo.test',
} as const;

/** Plan de pago de prueba con 3 editores (cifras del doble, no del catálogo, RN-3). */
export const PAID_TEST_LIMITS: PlanLimits = { ...DEFAULT_TEST_LIMITS, maxEditors: 3 };

/** Doble de `IDocumentEditor`: firma con una marca fija y la disponibilidad la decide la prueba (CA-15). */
export class FakeDocumentEditor implements IDocumentEditor {
  available = true;

  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...config, token: 'firma-de-prueba' };
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }
}

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
  /** `POST /files/:fileId/edit-session` con el token de `client`. */
  open(client: { id: string }, fileId: string): Promise<Response>;
  /** `GET /editing/content/:token`, sin token de usuario (como ONLYOFFICE). */
  content(token: string): Test;
  close(): Promise<void>;
}

export interface EditingHttpOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly limits?: PlanLimits;
  /** Sin el doble de `IDocumentEditor`: el real, para probar el `api` sin variables de ONLYOFFICE. */
  readonly realEditor?: boolean;
}

/** Tokens de los clientes de `storage.newClient`, para llamar rutas que `StorageClient` no conoce. */
const authOf = (storage: StorageHttpApp, clientId: string): string | undefined =>
  storage.tokenOf(clientId);

/**
 * App de integración de `editing` (016 T-03): `StorageModule` real con su misma instancia en `EditingModule`,
 * `AccessModule`, `IUserDirectory` real, Postgres como `nimbo_app`, MinIO real y dobles de límites y de ONLYOFFICE.
 */
export const createEditingHttpApp = async (
  options: EditingHttpOptions = {},
): Promise<EditingHttpApp> => {
  const editor = new FakeDocumentEditor();
  const storage = await createStorageHttpApp({
    env: { ...ONLYOFFICE_TEST_ENV, ...options.env },
    limits: options.limits ?? PAID_TEST_LIMITS,
    modules: [AccessModule, TestUserDirectoryModule],
    withStorage: (storageModule, env) => [EditingModule.forRoot(env, storageModule)],
    overrides:
      options.realEditor === true ? [] : [{ provide: I_DOCUMENT_EDITOR, useValue: editor }],
  });
  const http = () => request(storage.testApp.app.getHttpServer());
  return {
    storage,
    editor,
    open: (client, fileId) => {
      const token = authOf(storage, client.id);
      const call = http().post(`/api/v1/files/${fileId}/edit-session`);
      return token === undefined ? call : call.set('Authorization', `Bearer ${token}`);
    },
    content: (token) => http().get(`/api/v1/editing/content/${token}`),
    close: () => storage.close(),
  };
};

/** El token del enlace de contenido de una configuración de editor (`document.url`). */
export const contentTokenOf = (config: unknown): string => {
  const url = (config as { document: { url: string } }).document.url;
  return url.slice(url.lastIndexOf('/') + 1);
};
