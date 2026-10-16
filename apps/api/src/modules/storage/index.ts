// API pública del módulo `storage`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// No se exportan el detector de tipos, el escáner de cargas vencidas, el adaptador de auditoría ni los repositorios.
export { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
export type { IPlanLimitsProvider, PlanLimits } from './application/plan-limits';
export { I_NODE_METADATA_READER } from './application/node-metadata-reader';
export type {
  FileMetadata,
  FileMetadataPage,
  INodeMetadataReader,
} from './application/node-metadata-reader';
export { StorageModule } from './storage.module';
export { StorageWorkerModule } from './storage-worker.module';
