import { STORAGE_ERROR_CODES, type FieldIssueResponse } from '@nimbo/contracts';

/** `details` de `ErrorResponse` (plan 005 §5): cifras, `suggestedName`, `reason` o `extension`. */
export type StorageErrorDetails = Readonly<Record<string, string | number | boolean>>;

/**
 * Respuesta de error de la API de `storage` ya interpretada. Un fallo sin respuesta (red caída) **no** es este error:
 * el adaptador HTTP (T-53) lo deja pasar tal cual para que el manager lo trate como corte de red. `fields` trae los
 * campos en falla de un `400` (006 CA-2).
 */
export class StorageRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: StorageErrorDetails = {},
    readonly fields: readonly FieldIssueResponse[] = [],
  ) {
    super(code);
    this.name = 'StorageRequestError';
  }
}

/** `404 STORAGE_NODE_NOT_FOUND`: el elemento ya no existe, está en la papelera o no es visible para la cuenta. */
export function isStorageNotFound(error: unknown): boolean {
  return (
    error instanceof StorageRequestError &&
    error.code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND
  );
}
