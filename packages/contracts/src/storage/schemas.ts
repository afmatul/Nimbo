import { z } from 'zod';

import { STORAGE_FIELD_MESSAGES, type StorageFieldIssueReason } from './error-codes';
import {
  byteCount,
  field,
  folderField,
  nameField,
  timestamp,
  uploadOnConflictField,
  uuidSchema,
} from './schema-fields';

/** Tipo de archivo que ve el cliente (`archivo.tipo`); el dominio de `api` tiene su propio catálogo con MIME. */
export const FILE_KINDS = ['docx', 'pdf', 'texto', 'xlsx', 'pptx', 'imagen', 'otro'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Modo de carga que decide el servidor por umbral (D-2): el cliente nunca lo elige. */
export const UPLOAD_MODES = ['simple', 'multipart'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

export { ON_CONFLICT_OPTIONS, UPLOAD_ON_CONFLICT_OPTIONS } from './schema-fields';
export type { OnConflict, UploadOnConflict } from './schema-fields';

function sizeReason(value: unknown): StorageFieldIssueReason | null {
  if (value === undefined) return 'REQUIRED';
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? null
    : 'INVALID_SIZE';
}

/**
 * `POST /uploads` (005 plan §5; 006 agrega `folderId`; 014, `onConflict: replace`). Estricto: otra clave es
 * `UNKNOWN_FIELD`. `sizeBytes = 0` pasa: el `422 STORAGE_EMPTY_FILE` lo decide el servicio. El nombre se envía tal
 * cual; el servicio lo normaliza (`FileName`). `folderId` ausente o `null` es la raíz.
 */
export const initUploadSchema = z
  .object({
    name: nameField(),
    sizeBytes: field<number>(sizeReason),
    onConflict: uploadOnConflictField,
    folderId: folderField.default(null),
  })
  .strict(STORAGE_FIELD_MESSAGES.UNKNOWN_FIELD);

const uploadPartUrlSchema = z
  .object({ partNumber: z.number().int().positive(), url: z.string().url() })
  .strict();

const singleUploadTargetSchema = z
  .object({ url: z.string().url(), method: z.literal('PUT'), expiresAt: timestamp })
  .strict();

const partsBlock = {
  partSizeBytes: byteCount.positive(),
  totalParts: z.number().int().positive(),
  parts: z.array(uploadPartUrlSchema),
  urlsExpireAt: timestamp,
};

const initBase = { uploadId: uuidSchema, name: z.string().min(1), expiresAt: timestamp };

/** Respuesta `201` de `POST /uploads`: unión por `mode`. `name` es el nombre visto al iniciar (D-4). */
export const initUploadResponseSchema = z.discriminatedUnion('mode', [
  z.object({ ...initBase, mode: z.literal('simple'), upload: singleUploadTargetSchema }).strict(),
  z.object({ ...initBase, mode: z.literal('multipart'), ...partsBlock }).strict(),
]);

const completedPartSchema = z
  .object({ partNumber: z.number().int().positive(), sizeBytes: byteCount })
  .strict();

const resumeBase = {
  uploadId: uuidSchema,
  expiresAt: timestamp,
  completedParts: z.array(completedPartSchema),
};

/** Respuesta de `POST /uploads/:id/resume`: solo las partes que faltan, o la URL única si es simple (CA-8). */
export const resumeUploadResponseSchema = z.discriminatedUnion('mode', [
  z
    .object({ ...resumeBase, mode: z.literal('simple'), pending: singleUploadTargetSchema })
    .strict(),
  z
    .object({ ...resumeBase, mode: z.literal('multipart'), pending: z.object(partsBlock).strict() })
    .strict(),
]);

/**
 * Archivo tal como lo ve el cliente. Nunca lleva clave de objeto ni `upload_id`. `folderId: null` es la raíz.
 * `updatedAt` alimenta la columna «Modificado» (007).
 */
export const fileSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    sizeBytes: byteCount.positive(),
    kind: z.enum(FILE_KINDS),
    folderId: uuidSchema.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

/** Respuesta de `POST /uploads/:id/complete` (idempotente). */
export const completeUploadResponseSchema = z.object({ file: fileSummarySchema }).strict();

/** Respuesta de `POST /files/:id/download-url` (vigencia `DOWNLOAD_URL_TTL_SECONDS`, CA-13). */
export const downloadUrlSchema = z.object({ url: z.string().url(), expiresAt: timestamp }).strict();

export type InitUploadRequest = z.input<typeof initUploadSchema>;
export type InitUploadInput = z.output<typeof initUploadSchema>;
export type InitUploadResponse = z.infer<typeof initUploadResponseSchema>;
export type ResumeUploadResponse = z.infer<typeof resumeUploadResponseSchema>;
export type UploadPartUrl = z.infer<typeof uploadPartUrlSchema>;
export type CompletedPart = z.infer<typeof completedPartSchema>;
export type FileSummary = z.infer<typeof fileSummarySchema>;
export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>;
export type DownloadUrlResponse = z.infer<typeof downloadUrlSchema>;
