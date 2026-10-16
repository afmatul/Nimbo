// API pública del módulo `storage`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// No se exportan el detector de tipos, el escáner de cargas vencidas, el adaptador de auditoría ni los repositorios.
// `EditableFileGateway` es la fachada que consume `editing` (016, ADR-0012: la versión es de `storage`).
export { EditableFileGateway } from './application/editable-file.gateway';
export type { EditableFile } from './application/editable-file.gateway';
export type {
  EditedVersionInput,
  EditedVersionOutcome,
} from './application/edited-version.registrar';
export { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
export type { IPlanLimitsProvider, PlanLimits } from './application/plan-limits';
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
