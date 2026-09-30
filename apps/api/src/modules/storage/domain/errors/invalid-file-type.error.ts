import { InvalidInputError } from '../../../../shared/domain/errors';

/**
 * Por qué no pasó la validación de tipo real (CA-11, CA-24): firma que no coincide, ejecutable o texto que no es
 * UTF-8 válido. Coincide con `FILE_TYPE_REASONS` de `contracts/storage` (ADR-0008).
 */
export type FileTypeRejectionReason = 'signature' | 'executable' | 'text';

function messageFor(reason: FileTypeRejectionReason, extension: string): string {
  return reason === 'executable'
    ? 'No se permiten archivos ejecutables. Sube otro archivo.'
    : `Este archivo no es un .${extension} válido. Comprueba que sea el archivo correcto.`;
}

/** El contenido no corresponde a la extensión o es un ejecutable. HTTP 422 con `reason` y `extension`. */
export class InvalidFileTypeError extends InvalidInputError {
  readonly code = 'STORAGE_INVALID_FILE_TYPE';

  constructor(
    readonly reason: FileTypeRejectionReason,
    extension: string,
  ) {
    super(messageFor(reason, extension), undefined, { reason, extension });
  }
}
