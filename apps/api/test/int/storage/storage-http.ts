import { createHash, randomUUID } from 'node:crypto';

import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { I_PLAN_LIMITS_PROVIDER, StorageModule } from '../../../src/modules/storage';
import type { PlanLimits } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { FixedClock, Role } from '../../../src/shared';
import { connectAsOwner, requiredEnv } from '../../support/database-urls';
import { FakePlanLimitsProvider } from '../../support/fake-plan-limits.provider';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { insertAccount, insertFileWithVersion, removeAccounts } from './storage-test-db';
import type { FileRowOptions } from './storage-test-db';

const MIB = 1024 * 1024;
/** Mínimo de S3 para una parte que no es la última: el umbral y la parte más chicos que el arnés permite. */
export const TEST_PART_BYTES = 5 * MIB;
/** Límites del doble de `IPlanLimitsProvider` (R-3): cifras de prueba, no del catálogo de planes (RN-1). */
export const DEFAULT_TEST_LIMITS: PlanLimits = {
  maxFileBytes: BigInt(64 * MIB),
  storageQuotaBytes: BigInt(256 * MIB),
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

/** `PUT` directo a una URL prefirmada, como el navegador (los bytes no pasan por la API, DF-16). */
export const putToSignedUrl = (url: string, body: Uint8Array): Promise<globalThis.Response> =>
  fetch(url, { method: 'PUT', body });

/** Un cliente del mundo de la suite: su id y las rutas de `storage` con su token. */
export interface StorageClient {
  readonly id: string;
  readonly token: string;
  init(body: Record<string, unknown>): Promise<Response>;
  resume(uploadId: string): Promise<Response>;
  complete(uploadId: string): Promise<Response>;
  cancel(uploadId: string): Promise<Response>;
  list(query?: Record<string, string>): Promise<Response>;
  downloadUrl(fileId: string): Promise<Response>;
  /** Inicia, sube con la(s) URL(s) firmada(s) y completa; devuelve la respuesta de `complete`. */
  upload(name: string, bytes: Buffer, onConflict?: 'ask' | 'keep_both'): Promise<Response>;
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
  await Promise.all(
    initBody.parts.map((part) => {
      const start = (part.partNumber - 1) * initBody.partSizeBytes;
      return expectOk(
        putToSignedUrl(part.url, bytes.subarray(start, start + initBody.partSizeBytes)),
      );
    }),
  );
};

export type InitBody =
  | { uploadId: string; mode: 'simple'; name: string; upload: SignedTarget }
  | {
      uploadId: string;
      mode: 'multipart';
      name: string;
      partSizeBytes: number;
      totalParts: number;
      parts: { partNumber: number; url: string }[];
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
 * `PlanLimitsBindingModule` con el doble de límites (R-3), Postgres como `nimbo_app`, Redis real para la tasa y
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
  const testApp = await createTestApp({
    validatedEnv: env,
    modules: [PlanLimitsBindingModule, StorageModule.forRoot(env)],
    overrides: [{ provide: I_PLAN_LIMITS_PROVIDER, useValue: limits }],
  });
  const owner = await connectAsOwner();
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));
  const accounts: string[] = [];
  const http = () => request(testApp.app.getHttpServer());

  const newClient = async (role: Role = Role.CLIENT): Promise<StorageClient> => {
    const id = await insertAccount(owner, role);
    accounts.push(id);
    const token = tokens.valid({ userId: id, role, sessionId: randomUUID() });
    const auth = { Authorization: `Bearer ${token}` };
    const client: StorageClient = {
      id,
      token,
      init: (body) => http().post(`${API_PREFIX}/uploads`).set(auth).send(body),
      resume: (uploadId) => http().post(`${API_PREFIX}/uploads/${uploadId}/resume`).set(auth),
      complete: (uploadId) => http().post(`${API_PREFIX}/uploads/${uploadId}/complete`).set(auth),
      cancel: (uploadId) => http().delete(`${API_PREFIX}/uploads/${uploadId}`).set(auth),
      list: (query = {}) => http().get(`${API_PREFIX}/files`).query(query).set(auth),
      downloadUrl: (fileId) => http().post(`${API_PREFIX}/files/${fileId}/download-url`).set(auth),
      upload: async (name, bytes, onConflict = 'ask') => {
        const started = await client.init({ name, sizeBytes: bytes.length, onConflict });
        if (started.status !== 201) return started;
        const body = started.body as InitBody;
        await uploadBytes(body, bytes);
        return client.complete(body.uploadId);
      },
    };
    return client;
  };

  return {
    testApp,
    limits,
    owner,
    s3,
    publicHost: new URL(publicEndpoint).host,
    newClient,
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
}

export const uploadRow = async (owner: DataSource, uploadId: string): Promise<UploadRow> => {
  const rows = (await owner.query(
    'SELECT estado, motivo_rechazo, clave_objeto, archivo_id FROM carga WHERE id = $1',
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
