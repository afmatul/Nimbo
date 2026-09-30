/** Una parte ya recibida por el almacenamiento en una carga por partes. `listParts` es la fuente de verdad. */
export interface UploadedPart {
  readonly partNumber: number;
  readonly sizeBytes: bigint;
  readonly etag: string;
}

/** Metadatos de un objeto presente. */
export interface ObjectHead {
  readonly sizeBytes: bigint;
}

export interface PresignUploadPartInput {
  readonly key: string;
  readonly uploadId: string;
  readonly partNumber: number;
  /** Se firma: el `PUT` con otro `Content-Length` se rechaza. */
  readonly contentLength: bigint;
  readonly expiresInSeconds: number;
}

export interface PresignUploadObjectInput {
  readonly key: string;
  /** Se firma: el `PUT` con otro `Content-Length` se rechaza. */
  readonly contentLength: bigint;
  readonly expiresInSeconds: number;
}

export interface PresignDownloadInput {
  readonly key: string;
  /** Nombre sugerido al navegador (`Content-Disposition: attachment`); no forma parte de la clave. */
  readonly fileName: string;
  readonly expiresInSeconds: number;
}

/**
 * Almacenamiento de objetos (plan 005 §6, regla a). Las claves son `u/{propietario}/{archivo}/{version}` y nunca
 * salen de la API ni entran en una bitácora. Firmar es cómputo local (no hay red) contra el endpoint público;
 * el resto de operaciones usa el endpoint interno con tiempos de espera acotados.
 */
export interface IObjectStorage {
  /** Abre una carga por partes y devuelve su `uploadId`. */
  createMultipart(key: string): Promise<string>;
  presignUploadPart(input: PresignUploadPartInput): Promise<string>;
  presignUploadObject(input: PresignUploadObjectInput): Promise<string>;
  /** Todas las partes recibidas, en orden y ya paginadas; `null` si la carga por partes no existe (`NoSuchUpload`). */
  listParts(key: string, uploadId: string): Promise<readonly UploadedPart[] | null>;
  /** `false` si la carga por partes ya no existe (`NoSuchUpload`): otra petición la cerró o se abortó. */
  completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[],
  ): Promise<boolean>;
  /** Idempotente: una carga por partes que ya no existe no es error. */
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** `null` si el objeto no existe. */
  headObject(key: string): Promise<ObjectHead | null>;
  /** Bytes `[start, endInclusive]` del objeto (posiciones enteras seguras). */
  getRange(key: string, start: number, endInclusive: number): Promise<Buffer>;
  /** Borra todas las versiones y marcas de borrado de la clave (el bucket está versionado). Idempotente. */
  purgeObject(key: string): Promise<void>;
  /** URL de descarga con `attachment`, `application/octet-stream` y `no-store`, válida solo para esa clave. */
  presignDownload(input: PresignDownloadInput): Promise<string>;
}

export const I_OBJECT_STORAGE: unique symbol = Symbol('IObjectStorage');
