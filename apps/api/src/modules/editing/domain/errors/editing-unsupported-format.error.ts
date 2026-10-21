import { InvalidInputError } from '../../../../shared/domain/errors';

/** Pedir el editor para un archivo que no es `.docx` (CA-4, RN-1, ADR-0004). HTTP 422; no se abre el editor. */
export class EditingUnsupportedFormatError extends InvalidInputError {
  readonly code = 'EDITING_UNSUPPORTED_FORMAT';

  constructor() {
    super(
      'Solo se pueden editar documentos .docx en Nimbo. Descarga el archivo para abrirlo con otra aplicación.',
    );
  }
}
