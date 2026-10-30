// API pública del módulo `storage`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// No se exportan el detector de tipos, el escáner de cargas vencidas, el adaptador de auditoría, los repositorios ni
// el emisor interno de URLs (`AccessibleFileUrlIssuer`, 017 plan §2.3).
// `EditableFileGateway` es la fachada que consume `editing` (016, ADR-0012: la versión es de `storage`).
export { EditableFileGateway } from './application/editable-file.gateway';
export type { EditableFile } from './application/editable-file.gateway';
export type {
  EditedVersionInput,
  EditedVersionOutcome,
} from './application/edited-version.registrar';
export { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
export { NodeNotFoundError } from './domain/errors';
export type { IPlanLimitsProvider, PlanLimits } from './application/plan-limits';
export { StoragePreviewFacade } from './application/storage-preview.facade';
export type { PreviewDelivery } from './application/storage-preview.facade';
export { I_NODE_METADATA_READER } from './application/ports/i-node-metadata-reader.port';
export type {
  FileMetadata,
  FileMetadataPage,
  INodeMetadataReader,
} from './application/ports/i-node-metadata-reader.port';
export { StorageModule } from './storage.module';
// 009 (decisión 1): `billing` sube la factura PDF y firma su descarga; el puerto y su token, nada más.
export { I_OBJECT_STORAGE } from './application/ports/i-object-storage.port';
export { invoiceObjectKey } from './domain/invoice-object-key';
export type { IObjectStorage, PutObjectInput } from './application/ports/i-object-storage.port';
export { StorageWorkerModule } from './storage-worker.module';
// 019 (RN-11, ADR-0019): el evento de versión vigente lo exporta su productor; `intelligence` lo escucha y lee por la
// fachada `IndexableFileGateway`.
export { FILE_VERSION_CREATED } from './domain/file-version-created.event';
export type { FileVersionCreatedEvent } from './domain/file-version-created.event';
export type { FileKind } from './domain/file-kind';
export { IndexableFileGateway } from './application/indexable-file.gateway';
export type { IndexableFile } from './application/indexable-file.gateway';
export type { FileVersionRef, IdPage } from './application/ports/i-node.repository.port';
