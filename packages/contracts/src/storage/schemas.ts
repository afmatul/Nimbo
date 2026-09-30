import { z } from 'zod';

import { STORAGE_FIELD_MESSAGES, type StorageFieldIssueReason } from './error-codes';
import { FILE_NAME_MAX_LENGTH, FILES_PAGE_DEFAULT, FILES_PAGE_MAX } from './parameters';

/** Tipo de archivo que ve el cliente (`archivo.tipo`); el dominio de `api` tiene su propio catálogo con MIME. */
export const FILE_KINDS = ['docx', 'pdf', 'texto', 'xlsx', 'pptx', 'imagen', 'otro'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** Modo de carga que decide el servidor por umbral (D-2): el cliente nunca lo elige. */
export const UPLOAD_MODES = ['simple', 'multipart'] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

/** Respuesta ante un nombre repetido (CA-6): no existe «Reemplazar». */
export const ON_CONFLICT_OPTIONS = ['ask', 'keep_both'] as const;
export type OnConflict = (typeof ON_CONFLICT_OPTIONS)[number];

const PATH_SEPARATORS = new Set(['/', '\\']);
const RESERVED_NAMES = new Set(['.', '..']);
const LAST_C0_CONTROL = 0x1f;
const FIRST_DEL_OR_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;

/** Separador de ruta, NUL o carácter de control (C0, DEL y C1). */
function isForbiddenCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    PATH_SEPARATORS.has(character) ||
    code <= LAST_C0_CONTROL ||
    (code >= FIRST_DEL_OR_C1_CONTROL && code <= LAST_C1_CONTROL)
  );
}

function addIssue(ctx: z.RefinementCtx, reason: StorageFieldIssueReason): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: STORAGE_FIELD_MESSAGES[reason],
    params: { reason },
  });
}

function nameReason(value: unknown): StorageFieldIssueReason | null {
  if (typeof value !== 'string') return 'REQUIRED';
  const name = value.normalize('NFC').trim();
  if (name === '') return 'REQUIRED';
  const characters = Array.from(name);
  if (RESERVED_NAMES.has(name) || characters.some(isForbiddenCharacter)) return 'INVALID_NAME';
  return characters.length > FILE_NAME_MAX_LENGTH ? 'NAME_TOO_LONG' : null;
}

function sizeReason(value: unknown): StorageFieldIssueReason | null {
  if (value === undefined) return 'REQUIRED';
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? null
    : 'INVALID_SIZE';
}

/** Campo cuyo `reason` decide `reasonOf`, para que `fields[].reason` salga del conjunto cerrado (CA-7). */
function field<T>(reasonOf: (value: unknown) => StorageFieldIssueReason | null) {
  return z.custom<T>().superRefine((value: unknown, ctx) => {
    const reason = reasonOf(value);
    if (reason !== null) addIssue(ctx, reason);
  });
}

const ON_CONFLICT_MESSAGE = 'Elige «Conservar ambos» o «Cancelar» y vuelve a intentarlo.';

/**
 * `POST /uploads` (plan §5). Estricto: otra clave es `UNKNOWN_FIELD`. `sizeBytes = 0` pasa: el `422
 * STORAGE_EMPTY_FILE` lo decide el servicio. El nombre se envía tal cual; el servicio lo normaliza (`FileName`).
 */
export const initUploadSchema = z
  .object({
    name: field<string>(nameReason),
    sizeBytes: field<number>(sizeReason),
    onConflict: z
      .enum(ON_CONFLICT_OPTIONS, { message: ON_CONFLICT_MESSAGE })
      .default('ask'),
  })
  .strict(STORAGE_FIELD_MESSAGES.UNKNOWN_FIELD);

const timestamp = z.string().datetime();
const byteCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

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

const initBase = { uploadId: z.string().uuid(), name: z.string().min(1), expiresAt: timestamp };

/** Respuesta `201` de `POST /uploads`: unión por `mode`. `name` es el nombre visto al iniciar (D-4). */
export const initUploadResponseSchema = z.discriminatedUnion('mode', [
  z.object({ ...initBase, mode: z.literal('simple'), upload: singleUploadTargetSchema }).strict(),
  z.object({ ...initBase, mode: z.literal('multipart'), ...partsBlock }).strict(),
]);

const completedPartSchema = z
  .object({ partNumber: z.number().int().positive(), sizeBytes: byteCount })
  .strict();

const resumeBase = {
  uploadId: z.string().uuid(),
  expiresAt: timestamp,
  completedParts: z.array(completedPartSchema),
};

/** Respuesta de `POST /uploads/:id/resume`: solo las partes que faltan, o la URL única si es simple (CA-8). */
export const resumeUploadResponseSchema = z.discriminatedUnion('mode', [
  z.object({ ...resumeBase, mode: z.literal('simple'), pending: singleUploadTargetSchema }).strict(),
  z
    .object({ ...resumeBase, mode: z.literal('multipart'), pending: z.object(partsBlock).strict() })
    .strict(),
]);

/** Archivo tal como lo ve el cliente. Nunca lleva clave de objeto ni `upload_id`. */
export const fileSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    sizeBytes: byteCount.positive(),
    kind: z.enum(FILE_KINDS),
    createdAt: timestamp,
  })
  .strict();

/** Respuesta de `POST /uploads/:id/complete` (idempotente). */
export const completeUploadResponseSchema = z.object({ file: fileSummarySchema }).strict();

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed)) return FILES_PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(parsed), 1), FILES_PAGE_MAX);
}

/** Consulta de `GET /files`. `limit` fuera de rango se ajusta; el cursor es opaco y lo decodifica la API. */
export const listFilesQuerySchema = z.object({
  cursor: field<string>((value) =>
    value === undefined || (typeof value === 'string' && value !== '') ? null : 'INVALID_CURSOR',
  ).optional(),
  limit: z.unknown().transform(clampLimit),
});

/** Respuesta de `GET /files`: raíz, sin papelera, más recientes primero. */
export const listFilesResponseSchema = z
  .object({ items: z.array(fileSummarySchema), nextCursor: z.string().min(1).nullable() })
  .strict();

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
export type ListFilesQuery = z.output<typeof listFilesQuerySchema>;
export type ListFilesResponse = z.infer<typeof listFilesResponseSchema>;
export type DownloadUrlResponse = z.infer<typeof downloadUrlSchema>;
