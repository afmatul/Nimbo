import { FILE_NAME_MAX_LENGTH } from './parameters';

/** Catálogo único de códigos de error de `storage` (plan 005 §5). Las clases de `api` los reutilizan (Art. VI). */
export const STORAGE_ERROR_CODES = {
  STORAGE_INVALID_UPLOAD_REQUEST: 'STORAGE_INVALID_UPLOAD_REQUEST',
  STORAGE_INVALID_QUERY: 'STORAGE_INVALID_QUERY',
  STORAGE_EMPTY_FILE: 'STORAGE_EMPTY_FILE',
  STORAGE_FILE_TOO_LARGE: 'STORAGE_FILE_TOO_LARGE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_NAME_CONFLICT: 'STORAGE_NAME_CONFLICT',
  STORAGE_UPLOAD_NOT_FOUND: 'STORAGE_UPLOAD_NOT_FOUND',
  STORAGE_UPLOAD_EXPIRED: 'STORAGE_UPLOAD_EXPIRED',
  STORAGE_UPLOAD_INCOMPLETE: 'STORAGE_UPLOAD_INCOMPLETE',
  STORAGE_UPLOAD_SIZE_MISMATCH: 'STORAGE_UPLOAD_SIZE_MISMATCH',
  STORAGE_INVALID_FILE_TYPE: 'STORAGE_INVALID_FILE_TYPE',
  STORAGE_NODE_NOT_FOUND: 'STORAGE_NODE_NOT_FOUND',
  STORAGE_TOO_MANY_REQUESTS: 'STORAGE_TOO_MANY_REQUESTS',
} as const;
export type StorageErrorCode = (typeof STORAGE_ERROR_CODES)[keyof typeof STORAGE_ERROR_CODES];

/**
 * Conjunto cerrado de `fields[].reason` que `storage` emite en un `400` (CA-7). Lleva prefijo porque `identity` ya
 * exporta `FIELD_ISSUE_REASONS` desde la raíz del paquete.
 */
export const STORAGE_FIELD_ISSUE_REASONS = [
  'REQUIRED',
  'INVALID_NAME',
  'NAME_TOO_LONG',
  'INVALID_SIZE',
  'UNKNOWN_FIELD',
  'INVALID_CURSOR',
] as const;
export type StorageFieldIssueReason = (typeof STORAGE_FIELD_ISSUE_REASONS)[number];

/** Mensaje de cada `reason` de `fields`: la API lo envía y `web` lo muestra junto al campo (Art. VI.3). */
export const STORAGE_FIELD_MESSAGES: Readonly<Record<StorageFieldIssueReason, string>> = {
  REQUIRED: 'Completa este campo.',
  INVALID_NAME:
    'Este nombre no es válido. Quita «/», «\\» y los caracteres especiales, y vuelve a subir el archivo.',
  NAME_TOO_LONG: `Usa un nombre de ${String(FILE_NAME_MAX_LENGTH)} caracteres o menos y vuelve a subir el archivo.`,
  INVALID_SIZE: 'El tamaño del archivo no es válido. Vuelve a seleccionarlo e inténtalo de nuevo.',
  UNKNOWN_FIELD: 'Este campo no se admite. Quítalo y vuelve a intentarlo.',
  INVALID_CURSOR:
    'No pudimos leer esta página de la lista. Actualiza la lista e inténtalo de nuevo.',
};

/** Motivo con que se registra una carga rechazada (`carga.motivo_rechazo`). Única exportación (cambio 15b). */
export const REJECTION_REASONS = ['tamano', 'tipo_invalido'] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** `details.reason` de `STORAGE_INVALID_FILE_TYPE`. */
export const FILE_TYPE_REASONS = ['signature', 'executable', 'text'] as const;
export type FileTypeReason = (typeof FILE_TYPE_REASONS)[number];
