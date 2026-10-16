import { InvalidInputError } from '../../../../shared/domain/errors';

import type { BytesFormatter } from './bytes-formatter';

/** Se declaró o se subió un archivo de 0 bytes (CA-7). HTTP 422. */
export class EmptyFileError extends InvalidInputError {
  readonly code = 'STORAGE_EMPTY_FILE';

  constructor() {
    super('El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.');
  }
}

/** El archivo supera el máximo por archivo del plan (CA-3, CA-5). HTTP 422 con las cifras en `details`. */
export class FileTooLargeError extends InvalidInputError {
  readonly code = 'STORAGE_FILE_TOO_LARGE';

  constructor(sizeBytes: bigint, maxBytes: bigint, format: BytesFormatter) {
    const size = Number(sizeBytes);
    const max = Number(maxBytes);
    super(
      `Este archivo pesa ${format(size)} y tu plan permite hasta ${format(max)} por archivo. ` +
        'Reduce su tamaño o cambia de plan.',
      undefined,
      { sizeBytes: size, maxBytes: max },
    );
  }
}

/** Para qué se pide espacio: subir un archivo (005) o restaurar una versión (014 CA-12). */
export type QuotaPurpose = 'upload' | 'restore';

const QUOTA_PURPOSE_TEXT: Readonly<Record<QuotaPurpose, string>> = {
  upload: 'subir este archivo',
  restore: 'restaurar esta versión',
};

/** Lo usado más lo reservado más lo pedido supera la cuota (CA-4, CA-23; 014 CA-12). HTTP 422 con `missingBytes`. */
export class QuotaExceededError extends InvalidInputError {
  readonly code = 'STORAGE_QUOTA_EXCEEDED';

  constructor(missingBytes: bigint, format: BytesFormatter, purpose: QuotaPurpose = 'upload') {
    const missing = Number(missingBytes);
    super(
      `Te faltan ${format(missing)} de espacio para ${QUOTA_PURPOSE_TEXT[purpose]}. ` +
        'Libera espacio o cambia de plan.',
      undefined,
      { missingBytes: missing },
    );
  }
}

/** Los bytes reales superan el tamaño declarado (CA-5). HTTP 422, sin parámetros. */
export class UploadSizeMismatchError extends InvalidInputError {
  readonly code = 'STORAGE_UPLOAD_SIZE_MISMATCH';

  constructor() {
    super('El archivo cambió durante la carga. Vuelve a subirlo.');
  }
}
