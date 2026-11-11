import { z } from 'zod';

import { timestamp } from './schema-fields';
import { fileSummarySchema } from './schemas';
import type { FileKind } from './schemas';

/**
 * Contratos de la previsualización (spec 017, plan §4). La URL de vista se firma con la misma política que la
 * descarga de 005 (opción 4): sin `mime`, sin disposición ni clave de objeto en la respuesta.
 */

/** Tipos con vista previa (017 RN-1); `docx` y `otro` (SVG, BMP, HEIC…) quedan fuera. Fuente única para `api` y `web`. */
export const PREVIEWABLE_FILE_KINDS: ReadonlySet<FileKind> = new Set([
  'pdf',
  'xlsx',
  'pptx',
  'texto',
  'imagen',
]);

export function isPreviewableKind(kind: FileKind | undefined): kind is FileKind {
  return kind !== undefined && PREVIEWABLE_FILE_KINDS.has(kind);
}

/** Respuesta de `POST /files/:id/preview-url`: el archivo según la consulta actual, la URL firmada y su vencimiento. */
export const previewUrlResponseSchema = z
  .object({ file: fileSummarySchema, url: z.string().url(), expiresAt: timestamp })
  .strict();

/** Fallos que detecta el lector en el navegador (plan §4, Q-7): códigos del catálogo web, no respuestas HTTP. */
export const STORAGE_PREVIEW_FAILURE_CODES = {
  STORAGE_PREVIEW_PASSWORD_PROTECTED: 'STORAGE_PREVIEW_PASSWORD_PROTECTED',
  STORAGE_PREVIEW_CORRUPT: 'STORAGE_PREVIEW_CORRUPT',
  STORAGE_PREVIEW_UNAVAILABLE: 'STORAGE_PREVIEW_UNAVAILABLE',
  STORAGE_PREVIEW_EXPIRED: 'STORAGE_PREVIEW_EXPIRED',
} as const;
export type StoragePreviewFailureCode =
  (typeof STORAGE_PREVIEW_FAILURE_CODES)[keyof typeof STORAGE_PREVIEW_FAILURE_CODES];

export type PreviewUrlResponse = z.infer<typeof previewUrlResponseSchema>;
