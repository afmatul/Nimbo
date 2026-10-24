import type { FileKind } from './file-kind';

/** Nombre del evento en proceso de una versión vigente nueva (019 RN-11, ADR-0019). */
export const FILE_VERSION_CREATED = 'storage.file-version-created';

/**
 * Una versión pasó a ser la vigente de su archivo (carga nueva o de reemplazo, restauración, edición y, con 021,
 * optimización). Se publica **después del commit**; sin nombre de archivo ni clave de objeto (plan 019 §4).
 */
export interface FileVersionCreatedEvent {
  readonly fileId: string;
  readonly versionId: string;
  /** Propietario del archivo, aunque la versión la haya registrado otra cuenta. */
  readonly ownerId: string;
  readonly kind: FileKind;
}
