import { InvalidInputError } from '../../../../shared/domain/errors';

/** Una carpeta de una descarga por lote tiene más archivos de los que caben en el lote. HTTP 422 (solo por elemento). */
export class BatchTooLargeError extends InvalidInputError {
  readonly code = 'STORAGE_BATCH_TOO_LARGE';

  constructor(maxFiles: number) {
    super(
      `Esta carpeta tiene más de ${String(maxFiles)} archivos para descargar a la vez. Descárgala por partes o abre la carpeta y elige menos archivos.`,
    );
  }
}
