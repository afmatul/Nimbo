import { FILE_NAME_MAX_LENGTH } from './parameters';

/**
 * Catálogo único de códigos de error de `storage` (plan 005 §5, plan 006 §4 y §9.2, plan 014 §4 y plan 010 §2). Las clases de `api`
 * los reutilizan (Art. VI).
 */
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
  STORAGE_INVALID_MOVE: 'STORAGE_INVALID_MOVE',
  STORAGE_FOLDER_DEPTH_EXCEEDED: 'STORAGE_FOLDER_DEPTH_EXCEEDED',
  STORAGE_INVALID_NODE_REQUEST: 'STORAGE_INVALID_NODE_REQUEST',
  STORAGE_QUICK_ACCESS_LIMIT: 'STORAGE_QUICK_ACCESS_LIMIT',
  STORAGE_VERSION_NOT_FOUND: 'STORAGE_VERSION_NOT_FOUND',
  STORAGE_VERSION_ALREADY_CURRENT: 'STORAGE_VERSION_ALREADY_CURRENT',
  /** 010 CA-13: la cuenta está en solo lectura por vencimiento (ADR-0029). */
  STORAGE_ACCOUNT_READ_ONLY: 'STORAGE_ACCOUNT_READ_ONLY',
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
  'INVALID_FOLDER',
  'INVALID_SORT',
  'INVALID_DIRECTION',
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
  INVALID_FOLDER: 'Esta carpeta no es válida. Elige otra carpeta y vuelve a intentarlo.',
  INVALID_SORT:
    'Este orden no es válido. Ordena por nombre, tamaño, fecha de modificación o fecha de creación y vuelve a intentarlo.',
  INVALID_DIRECTION:
    'Esta dirección de orden no es válida. Elige ascendente o descendente y vuelve a intentarlo.',
};

/**
 * Mensajes de campo al crear o renombrar carpetas y al renombrar archivos (006): mismos motivos, pero los de nombre no
 * hablan de «subir».
 */
export const STORAGE_NODE_FIELD_MESSAGES: Readonly<Record<StorageFieldIssueReason, string>> = {
  ...STORAGE_FIELD_MESSAGES,
  INVALID_NAME:
    'Este nombre no es válido. Quita «/», «\\» y los caracteres especiales, y vuelve a intentarlo.',
  NAME_TOO_LONG: `Usa un nombre de ${String(FILE_NAME_MAX_LENGTH)} caracteres o menos y vuelve a intentarlo.`,
};

/** Motivo con que se registra una carga rechazada (`carga.motivo_rechazo`). Única exportación (cambio 15b). */
export const REJECTION_REASONS = ['tamano', 'tipo_invalido'] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** `details.reason` de `STORAGE_INVALID_FILE_TYPE`. */
export const FILE_TYPE_REASONS = ['signature', 'executable', 'text'] as const;
export type FileTypeReason = (typeof FILE_TYPE_REASONS)[number];
