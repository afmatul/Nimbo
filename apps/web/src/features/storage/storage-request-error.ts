/** `details` de `ErrorResponse` (plan 005 §5): cifras, `suggestedName`, `reason` o `extension`. */
export type StorageErrorDetails = Readonly<Record<string, string | number | boolean>>;

/**
 * Respuesta de error de la API de `storage` ya interpretada. Un fallo sin respuesta (red caída) **no** es este error:
 * el adaptador HTTP (T-53) lo deja pasar tal cual para que el manager lo trate como corte de red.
 */
export class StorageRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: StorageErrorDetails = {},
  ) {
    super(code);
    this.name = 'StorageRequestError';
  }
}
