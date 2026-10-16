import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { DynamicModule } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { I_PLAN_LIMITS_PROVIDER, StorageModule } from '../../../src/modules/storage';
import type { PlanLimits } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FixedClock, Role } from '../../../src/shared';
import type { Env } from '../../../src/shared';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { FakePlanLimitsProvider } from '../../support/fake-plan-limits.provider';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp, TestAppOptions } from '../setup/test-app';

import { insertAccount, insertFileWithVersion, removeAccounts } from './storage-test-db';
import type { FileRowOptions } from './storage-test-db';

const MIB = 1024 * 1024;
/** Mínimo de S3 para una parte que no es la última: el umbral y la parte más chicos que el arnés permite. */
export const TEST_PART_BYTES = 5 * MIB;
/** Límites del doble de `IPlanLimitsProvider` (R-3): cifras de prueba, no del catálogo de planes (RN-1). */
export const DEFAULT_TEST_LIMITS: PlanLimits = {
  maxFileBytes: BigInt(64 * MIB),
  storageQuotaBytes: BigInt(256 * MIB),
  trashRetentionDays: 30,
  retainedVersions: 3,
  maxEditors: 0,
  planName: 'Plan de prueba',
};
/** Bucket propio y **versionado**, como el de `infra/minio/init.sh`: el compartido del arnés no tiene versionado. */
export const STORAGE_HTTP_BUCKET = 'nimbo-storage-http';

const API_PREFIX = '/api/v1';

/**
 * El mismo MinIO con otro nombre de host: la API firma contra el público (`MINIO_PUBLIC_ENDPOINT`) y opera contra el
 * interno, así que una URL emitida muestra el host público y nunca el interno ni el de web/API (CA-14).
 */
export const publicAliasOf = (endpoint: string): string => {
  const url = new URL(endpoint);
  url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  return url.origin;
};

/** Cliente S3 del arnés (credenciales raíz del contenedor) para inspeccionar el bucket o subir por fuera de la API. */
export const harnessS3 = (): S3Client =>
  new S3Client({
    endpoint: requiredEnv('MINIO_ENDPOINT'),
    region: requiredEnv('MINIO_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv('MINIO_ACCESS_KEY'),
      secretAccessKey: requiredEnv('MINIO_SECRET_KEY'),
    },
  });

const ensureVersionedBucket = async (s3: S3Client): Promise<void> => {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: STORAGE_HTTP_BUCKET }));
  } catch (error: unknown) {
    if (!(error instanceof BucketAlreadyOwnedByYou)) throw error;
  }
  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: STORAGE_HTTP_BUCKET,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  );
};

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Bytes de texto UTF-8 válido (pasan el detector como `.txt`) del tamaño pedido. */
export const textBytes = (size: number, seed = 'nimbo'): Buffer => {
  const unit = Buffer.from(`${seed}-${randomUUID()}\n`, 'utf8');
  return Buffer.alloc(size, unit);
};

/** Cabecera fija que no es de ningún ejecutable (PE, ELF, Mach-O): los bytes pasan como «otros» (CA-12). */
const OTHER_HEADER = Buffer.from('NIMBO-BIN', 'latin1');

/** Bytes aleatorios de un archivo «otros» (p. ej. `.bin`), del tamaño pedido. */
export const otherBytes = (size: number): Buffer => {
  const bytes = randomBytes(size);
  OTHER_HEADER.copy(bytes, 0);
  return bytes;
};

/** `PUT` directo a una URL prefirmada, como el navegador (los bytes no pasan por la API, DF-16). */
export const putToSignedUrl = (url: string, body: Uint8Array): Promise<globalThis.Response> =>
  fetch(url, { method: 'PUT', body });

/** Un cliente del mundo de la suite: su id y las rutas de `storage` con su token. */
export interface StorageClient {
  readonly id: string;
  init(body: Record<string, unknown>): Promise<Response>;
  resume(uploadId: string): Promise<Response>;
  complete(uploadId: string): Promise<Response>;
  cancel(uploadId: string): Promise<Response>;
  downloadUrl(fileId: string): Promise<Response>;
  renameFile(fileId: string, body: Record<string, unknown>): Promise<Response>;
  moveFile(fileId: string, body: Record<string, unknown>): Promise<Response>;
  folderContents(query?: Record<string, string>): Promise<Response>;
  createFolder(body: Record<string, unknown>): Promise<Response>;
  renameFolder(folderId: string, body: Record<string, unknown>): Promise<Response>;
  moveFolder(folderId: string, body: Record<string, unknown>): Promise<Response>;
  /** `GET /quick-access` (006 §9.2). */
  quickAccess(): Promise<Response>;
  /** `PUT /quick-access/pins/:nodeType/:nodeId`; `nodeType` es `files` o `folders` (otro valor prueba el 404). */
  pin(nodeType: string, nodeId: string): Promise<Response>;
  unpin(nodeType: string, nodeId: string): Promise<Response>;
  /** `POST /quick-access/recents/:nodeType/:nodeId`, sin cuerpo. */
  recordOpen(nodeType: string, nodeId: string): Promise<Response>;
  trashFolder(folderId: string): Promise<Response>;
  purgeFolder(folderId: string): Promise<Response>;
  restoreFolder(folderId: string): Promise<Response>;
  emptyTrash(): Promise<Response>;
  spaceSummary(): Promise<Response>;
  /** `GET /files/:fileId/versions` (014). */
  fileVersions(fileId: string): Promise<Response>;
  /** `POST /files/:fileId/versions/:versionId/restore` (014). */
  restoreVersion(fileId: string, versionId: string): Promise<Response>;
  /** `POST /files/:fileId/versions/:versionId/download-url` (014). */
  versionDownloadUrl(fileId: string, versionId: string): Promise<Response>;
  /** Inicia (en `folderId`, por defecto la raíz), sube con la(s) URL(s) firmada(s) y completa; devuelve `complete`. */
  upload(
    name: string,
    bytes: Buffer,
    onConflict?: 'ask' | 'keep_both' | 'replace',
    folderId?: string | null,
  ): Promise<Response>;
}

export interface StorageHttpApp {
  readonly testApp: TestApp;
  readonly limits: FakePlanLimitsProvider;
  /** Conexión como el dueño de las tablas, para *fixtures* y para leer el estado real. */
  readonly owner: DataSource;
  readonly s3: S3Client;
  /** Host (`host:puerto`) contra el que se firman las URLs. */
  readonly publicHost: string;
  newClient(role?: Role): Promise<StorageClient>;
  /** Token de acceso de una cuenta creada con `newClient`, para rutas de otros módulos (p. ej. `editing`, 016). */
  tokenOf(id: string): string | undefined;
  /** Rutas de una cuenta que la suite ya creó (p. ej. el mundo de aislamiento); sin `token`, sin `Authorization`. */
  clientFor(id: string, token?: string): StorageClient;
  /** Versiones y marcas de borrado que quedan en el bucket bajo una clave. */
  versionsOf(key: string): Promise<number>;
  readObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface StorageHttpOptions {
  /** Variables que cambian respecto del arnés (p. ej. límites de tasa bajos). */
  readonly env?: Readonly<Record<string, string>>;
  readonly limits?: PlanLimits;
  /**
   * Usa el enlace real de `PlanLimitsBindingModule` (`billing` leyendo la tabla `plan` sembrada) en lugar del doble
   * (PD-56). Con esto, `limits` del resultado no gobierna nada.
   */
  readonly realPlanLimits?: boolean;
  /**
   * `'identity'` usa la `JwtStrategy` real (p. ej. el mundo de aislamiento con `world.appComposition()`, 002 T-55);
   * entonces `newClient` no sirve, porque firma con `TestAccessTokens`: se usa `clientFor` con un token real.
   */
  readonly accessTokenStrategy?: TestAppOptions['accessTokenStrategy'];
  /** Módulos que se suman a `storage` (p. ej. la composición de `identity` del mundo de aislamiento). */
  readonly modules?: TestAppOptions['modules'];
  /**
   * Módulos que necesitan **la misma** instancia de `StorageModule` (p. ej. `EditingModule.forRoot(env, { storage,
   * realtime })` de 016) y el entorno validado.
   */
  readonly withStorage?: (
    storage: DynamicModule,
    env: Env,
  ) => NonNullable<TestAppOptions['modules']>;
  /** Proveedores sustituidos además del doble de límites (p. ej. el editor de 016). */
  readonly overrides?: TestAppOptions['overrides'];
  /** Instala el canal en vivo (015) como `main.ts`; exige `RealtimeModule` entre los módulos (p. ej. `editing`, 016). */
  readonly withRealtime?: boolean;
}

interface SignedTarget {
  readonly url: string;
}

/** Sube los bytes a las URLs de un inicio (simple o por partes), respetando el tamaño de parte que fijó el servidor. */
export const uploadBytes = async (initBody: InitBody, bytes: Buffer): Promise<void> => {
  if (initBody.mode === 'simple') {
    await expectOk(putToSignedUrl(initBody.upload.url, bytes));
    return;
  }
  await uploadParts(initBody.parts, initBody.partSizeBytes, bytes);
};

/** Sube, en paralelo, el trozo de `bytes` que le toca a cada parte firmada (las de un inicio o de un `resume`). */
export const uploadParts = async (
  parts: readonly SignedPart[],
  partSizeBytes: number,
  bytes: Buffer,
): Promise<void> => {
  await Promise.all(
    parts.map((part) => {
      const start = (part.partNumber - 1) * partSizeBytes;
      return expectOk(putToSignedUrl(part.url, bytes.subarray(start, start + partSizeBytes)));
    }),
  );
};

/** URL firmada de una parte. */
export interface SignedPart {
  readonly partNumber: number;
  readonly url: string;
}

export type InitBody =
  | { uploadId: string; mode: 'simple'; name: string; upload: SignedTarget }
  | {
      uploadId: string;
      mode: 'multipart';
      name: string;
      partSizeBytes: number;
      totalParts: number;
      parts: SignedPart[];
    };

const expectOk = async (pending: Promise<globalThis.Response>): Promise<void> => {
  const response = await pending;
  if (!response.ok) {
    throw new Error(
      `PUT prefirmado rechazado: ${String(response.status)} ${await response.text()}`,
    );
  }
};

/**
 * App HTTP de `storage` para las suites de integración de 005 (T-43, T-44): `StorageModule` real, la raíz de
 * `PlanLimitsBindingModule` con el doble de límites (R-3; `realPlanLimits` lo quita), Postgres como `nimbo_app`, Redis real para la tasa y
 * MinIO real con un bucket versionado. Las cuentas se insertan como el dueño (*fixtures*) y se borran al cerrar.
 */
export const createStorageHttpApp = async (
  options: StorageHttpOptions = {},
): Promise<StorageHttpApp> => {
  const s3 = harnessS3();
  await ensureVersionedBucket(s3);
  const publicEndpoint = publicAliasOf(requiredEnv('MINIO_ENDPOINT'));
  const env = buildTestEnv({
    MINIO_BUCKET: STORAGE_HTTP_BUCKET,
    MINIO_PUBLIC_ENDPOINT: publicEndpoint,
    UPLOAD_PART_SIZE_BYTES: String(TEST_PART_BYTES),
    UPLOAD_MULTIPART_THRESHOLD_BYTES: String(TEST_PART_BYTES),
    ...options.env,
  });
  const limits = new FakePlanLimitsProvider(options.limits ?? DEFAULT_TEST_LIMITS);
  const storageModule = StorageModule.forRoot(env);
  const testApp = await createTestApp({
    validatedEnv: env,
    accessTokenStrategy: options.accessTokenStrategy ?? 'test',
    modules: [
      ...(options.modules ?? []),
      PlanLimitsBindingModule,
      storageModule,
      ...(options.withStorage?.(storageModule, env) ?? []),
    ],
    overrides: [
      ...(options.realPlanLimits === true
        ? []
        : [{ provide: I_PLAN_LIMITS_PROVIDER, useValue: limits }]),
      ...(options.overrides ?? []),
    ],
    withRealtime: options.withRealtime ?? false,
  });
  const owner = await connectAsOwner();
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
  const accounts: string[] = [];
  const http = () => request(testApp.app.getHttpServer());

  const clientFor = (id: string, token?: string): StorageClient => {
    const auth: Record<string, string> =
      token === undefined ? {} : { Authorization: `Bearer ${token}` };
    const client: StorageClient = {
      id,
      init: (body) => http().post(`${API_PREFIX}/uploads`).set(auth).send(body),
      resume: (uploadId) => http().post(`${API_PREFIX}/uploads/${uploadId}/resume`).set(auth),
      complete: (uploadId) => http().post(`${API_PREFIX}/uploads/${uploadId}/complete`).set(auth),
      cancel: (uploadId) => http().delete(`${API_PREFIX}/uploads/${uploadId}`).set(auth),
      downloadUrl: (fileId) => http().post(`${API_PREFIX}/files/${fileId}/download-url`).set(auth),
      renameFile: (fileId, body) =>
        http().patch(`${API_PREFIX}/files/${fileId}`).set(auth).send(body),
      moveFile: (fileId, body) =>
        http().post(`${API_PREFIX}/files/${fileId}/move`).set(auth).send(body),
      folderContents: (query = {}) =>
        http().get(`${API_PREFIX}/folders/contents`).query(query).set(auth),
      createFolder: (body) => http().post(`${API_PREFIX}/folders`).set(auth).send(body),
      renameFolder: (folderId, body) =>
        http().patch(`${API_PREFIX}/folders/${folderId}`).set(auth).send(body),
      moveFolder: (folderId, body) =>
        http().post(`${API_PREFIX}/folders/${folderId}/move`).set(auth).send(body),
      quickAccess: () => http().get(`${API_PREFIX}/quick-access`).set(auth),
      pin: (nodeType, nodeId) =>
        http().put(`${API_PREFIX}/quick-access/pins/${nodeType}/${nodeId}`).set(auth),
      unpin: (nodeType, nodeId) =>
        http().delete(`${API_PREFIX}/quick-access/pins/${nodeType}/${nodeId}`).set(auth),
      recordOpen: (nodeType, nodeId) =>
        http().post(`${API_PREFIX}/quick-access/recents/${nodeType}/${nodeId}`).set(auth),
      trashFolder: (folderId) => http().delete(`${API_PREFIX}/folders/${folderId}`).set(auth),
      purgeFolder: (folderId) => http().delete(`${API_PREFIX}/trash/folders/${folderId}`).set(auth),
      restoreFolder: (folderId) =>
        http().post(`${API_PREFIX}/trash/folders/${folderId}/restore`).set(auth),
      emptyTrash: () => http().delete(`${API_PREFIX}/trash`).set(auth),
      spaceSummary: () => http().get(`${API_PREFIX}/storage/summary`).set(auth),
      fileVersions: (fileId) => http().get(`${API_PREFIX}/files/${fileId}/versions`).set(auth),
      restoreVersion: (fileId, versionId) =>
        http().post(`${API_PREFIX}/files/${fileId}/versions/${versionId}/restore`).set(auth),
      versionDownloadUrl: (fileId, versionId) =>
        http().post(`${API_PREFIX}/files/${fileId}/versions/${versionId}/download-url`).set(auth),
      upload: async (name, bytes, onConflict = 'ask', folderId = null) => {
        const started = await client.init({ name, sizeBytes: bytes.length, onConflict, folderId });
        if (started.status !== 201) return started;
        const body = started.body as InitBody;
        await uploadBytes(body, bytes);
        return client.complete(body.uploadId);
      },
    };
    return client;
  };

  const issued = new Map<string, string>();
  const newClient = async (role: Role = Role.CLIENT): Promise<StorageClient> => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    const token = tokens.valid({ userId: id, role, sessionId: randomUUID() });
    issued.set(id, token);
    return clientFor(id, token);
  };

  return {
    testApp,
    limits,
    owner,
    s3,
    publicHost: new URL(publicEndpoint).host,
    newClient,
    tokenOf: (id) => issued.get(id),
    clientFor,
    versionsOf: async (key) => {
      const page = await s3.send(
        new ListObjectVersionsCommand({ Bucket: STORAGE_HTTP_BUCKET, Prefix: key }),
      );
      return [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].filter(
        (entry) => entry.Key === key,
      ).length;
    },
    readObject: async (key) => {
      const object = await s3.send(new GetObjectCommand({ Bucket: STORAGE_HTTP_BUCKET, Key: key }));
      if (object.Body === undefined) throw new Error('El objeto no tiene cuerpo');
      return Buffer.from(await object.Body.transformToByteArray());
    },
    putObject: async (key, body) => {
      await s3.send(new PutObjectCommand({ Bucket: STORAGE_HTTP_BUCKET, Key: key, Body: body }));
    },
    close: async () => {
      await testApp.close();
      await removeAccounts(owner, accounts);
      await owner.destroy();
      s3.destroy();
    },
  };
};

/** Estado de una carga visto por el dueño de las tablas (sin RLS). */
export interface UploadRow {
  readonly estado: string;
  readonly motivo_rechazo: string | null;
  readonly clave_objeto: string;
  readonly archivo_id: string;
  /** Id del multipart en MinIO; `null` en una carga simple. */
  readonly upload_id: string | null;
}

export const uploadRow = async (owner: DataSource, uploadId: string): Promise<UploadRow> => {
  const rows = (await owner.query(
    'SELECT estado, motivo_rechazo, clave_objeto, archivo_id, upload_id FROM carga WHERE id = $1',
    [uploadId],
  )) as UploadRow[];
  const [row] = rows;
  if (row === undefined) throw new Error('La carga no existe');
  return row;
};

export const countRows = async (
  owner: DataSource,
  table: 'carga' | 'archivo',
  ownerId: string,
): Promise<number> => {
  const rows = (await owner.query(
    `SELECT count(*)::int AS total FROM ${table} WHERE propietario_id = $1`,
    [ownerId],
  )) as { total: number }[];
  return rows[0]?.total ?? 0;
};

export const usedBytesOf = async (owner: DataSource, userId: string): Promise<bigint> => {
  const rows = (await owner.query(
    'SELECT espacio_usado::text AS usado FROM usuario WHERE id = $1',
    [userId],
  )) as { usado: string }[];
  return BigInt(rows[0]?.usado ?? '0');
};

/** Archivo ya registrado (como el dueño), en una transacción propia: la FK `version_actual_id` es diferida. */
export const insertCommittedFile = (
  owner: DataSource,
  ownerId: string,
  options: FileRowOptions = {},
): Promise<{ fileId: string; versionId: string }> =>
  owner.transaction((manager) => insertFileWithVersion(manager, ownerId, options));
