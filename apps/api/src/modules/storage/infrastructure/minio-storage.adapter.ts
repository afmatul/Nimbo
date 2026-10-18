import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { ObjectIdentifier } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { MinioConfig } from '../../../shared';
import type {
  IObjectStorage,
  ObjectHead,
  PresignDownloadInput,
  PutObjectInput,
  PresignUploadObjectInput,
  PresignUploadPartInput,
  UploadedPart,
} from '../application/ports/i-object-storage.port';
import { isInvoiceObjectKey } from '../domain/invoice-object-key';

/**
 * El cliente interno corre dentro de la transacción de `init` (con `FOR UPDATE` sobre `usuario`) al crear un
 * multipart: estos tiempos acotan cuánto puede retener un MinIO lento la fila y la conexión (plan 005 §6).
 */
export const INTERNAL_CONNECT_TIMEOUT_MS = 2_000;
export const INTERNAL_REQUEST_TIMEOUT_MS = 10_000;

/** Dos clientes: uno para operar contra el endpoint interno y otro que solo firma contra el público. */
export interface MinioStorageClients {
  readonly operations: S3Client;
  readonly signing: S3Client;
}

const baseClientConfig = (config: MinioConfig) => ({
  region: config.MINIO_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: config.MINIO_ACCESS_KEY, secretAccessKey: config.MINIO_SECRET_KEY },
});

/** Construye los dos `S3Client`. Firmar es cómputo local: el cliente de firma nunca abre una conexión. */
export const buildMinioStorageClients = (
  config: MinioConfig,
  publicEndpoint: string,
): MinioStorageClients => ({
  operations: new S3Client({
    ...baseClientConfig(config),
    endpoint: config.MINIO_ENDPOINT,
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: INTERNAL_CONNECT_TIMEOUT_MS,
      requestTimeout: INTERNAL_REQUEST_TIMEOUT_MS,
    },
  }),
  signing: new S3Client({
    ...baseClientConfig(config),
    endpoint: publicEndpoint,
    // Sin suma de verificación calculada al firmar: la del cuerpo vacío invalidaría el `PUT` del navegador.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  }),
});

/** Cabeceras que la URL de carga fija en la firma: un `PUT` con otro tamaño se rechaza. */
const SIGNED_UPLOAD_HEADERS: ReadonlySet<string> = new Set(['content-length']);
const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';
const DOWNLOAD_CACHE_CONTROL = 'no-store';

/** `filename*` de RFC 8187: `encodeURIComponent` deja sin escapar `'()*`, que ahí no son válidos. */
const encodeRfc8187 = (value: string): string =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const attachmentDisposition = (fileName: string): string =>
  `attachment; filename*=UTF-8''${encodeRfc8187(fileName)}`;

const errorName = (error: unknown): string | undefined =>
  error instanceof Error ? error.name : undefined;

const httpStatus = (error: unknown): number | undefined =>
  (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;

const isNoSuchUpload = (error: unknown): boolean => errorName(error) === 'NoSuchUpload';

const isMissingObject = (error: unknown): boolean =>
  errorName(error) === 'NotFound' || errorName(error) === 'NoSuchKey' || httpStatus(error) === 404;

/** Adaptador de `IObjectStorage` sobre MinIO con el SDK de S3 (ADR-0015). Nunca registra claves ni URLs. */
export class MinioStorageAdapter implements IObjectStorage {
  constructor(
    private readonly clients: MinioStorageClients,
    private readonly bucket: string,
  ) {}

  async createMultipart(key: string): Promise<string> {
    const output = await this.clients.operations.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key }),
    );
    if (output.UploadId === undefined) {
      throw new Error('MinIO no devolvió el identificador de la carga por partes.');
    }
    return output.UploadId;
  }

  presignUploadPart(input: PresignUploadPartInput): Promise<string> {
    return getSignedUrl(
      this.clients.signing,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: Number(input.contentLength),
      }),
      { expiresIn: input.expiresInSeconds, signableHeaders: new Set(SIGNED_UPLOAD_HEADERS) },
    );
  }

  presignUploadObject(input: PresignUploadObjectInput): Promise<string> {
    return getSignedUrl(
      this.clients.signing,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentLength: Number(input.contentLength),
      }),
      { expiresIn: input.expiresInSeconds, signableHeaders: new Set(SIGNED_UPLOAD_HEADERS) },
    );
  }

  presignDownload(input: PresignDownloadInput): Promise<string> {
    return getSignedUrl(
      this.clients.signing,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ResponseContentDisposition: attachmentDisposition(input.fileName),
        ResponseContentType: DOWNLOAD_CONTENT_TYPE,
        ResponseCacheControl: DOWNLOAD_CACHE_CONTROL,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async listParts(key: string, uploadId: string): Promise<readonly UploadedPart[] | null> {
    try {
      return await this.collectParts(key, uploadId);
    } catch (error: unknown) {
      if (isNoSuchUpload(error)) {
        return null;
      }
      throw error;
    }
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[],
  ): Promise<boolean> {
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    try {
      await this.clients.operations.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: ordered.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
          },
        }),
      );
      return true;
    } catch (error: unknown) {
      if (isNoSuchUpload(error)) {
        return false;
      }
      throw error;
    }
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    try {
      await this.clients.operations.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
      );
    } catch (error: unknown) {
      if (!isNoSuchUpload(error)) {
        throw error;
      }
    }
  }

  async headObject(key: string): Promise<ObjectHead | null> {
    try {
      const output = await this.clients.operations.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: BigInt(output.ContentLength ?? 0) };
    } catch (error: unknown) {
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  async getRange(key: string, start: number, endInclusive: number): Promise<Buffer> {
    const output = await this.clients.operations.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${String(start)}-${String(endInclusive)}`,
      }),
    );
    if (output.Body === undefined) {
      return Buffer.alloc(0);
    }
    return Buffer.from(await output.Body.transformToByteArray());
  }

  /**
   * Copia en el servidor (los bytes no pasan por la API). `CopyObject` admite hasta 5 GB, más que el máximo por archivo
   * del plan más alto (plan 014 §7). Repetirla sobrescribe el destino con el mismo contenido (idempotente). Un origen
   * ausente (`NoSuchKey`) devuelve `false`.
   */
  async copyObject(sourceKey: string, targetKey: string): Promise<boolean> {
    try {
      await this.clients.operations.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: targetKey,
          CopySource: `${this.bucket}/${sourceKey}`,
        }),
      );
      return true;
    } catch (error: unknown) {
      if (isMissingObject(error)) {
        return false;
      }
      throw error;
    }
  }

  async purgeObject(key: string): Promise<void> {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    let truncated = true;
    while (truncated) {
      const page = await this.clients.operations.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      await this.deleteVersions(
        [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
          .filter((entry) => entry.Key === key)
          .map((entry) => ({ Key: key, VersionId: entry.VersionId })),
      );
      truncated = page.IsTruncated === true;
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    if (!isInvoiceObjectKey(input.key)) {
      throw new Error('putObject solo acepta claves invoices/{usuario}/{factura}.pdf.');
    }
    await this.clients.operations.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  private async collectParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    let truncated = true;
    while (truncated) {
      const page = await this.clients.operations.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        parts.push({
          partNumber: part.PartNumber ?? 0,
          sizeBytes: BigInt(part.Size ?? 0),
          etag: part.ETag ?? '',
        });
      }
      truncated = page.IsTruncated === true;
      marker = page.NextPartNumberMarker;
    }
    return parts;
  }

  /** Una página de `ListObjectVersions` trae como mucho 1000 entradas: cabe en un `DeleteObjects`. */
  private async deleteVersions(objects: readonly ObjectIdentifier[]): Promise<void> {
    if (objects.length === 0) {
      return;
    }
    const output = await this.clients.operations.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: [...objects], Quiet: true },
      }),
    );
    const failures = output.Errors?.length ?? 0;
    if (failures > 0) {
      throw new Error(`MinIO no pudo borrar ${String(failures)} versiones del objeto.`);
    }
  }
}
