import { InvalidInputError } from '../../../../shared/domain/errors';

const MESSAGE = 'Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.';

/** El archivo es accesible, pero su tipo (`docx`, `otro`) no tiene vista previa (017 CA-11, RN-1). HTTP 422. */
export class PreviewUnsupportedError extends InvalidInputError {
  readonly code = 'STORAGE_PREVIEW_UNSUPPORTED';

  constructor() {
    super(MESSAGE);
  }
}
