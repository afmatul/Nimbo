// API pública del módulo `storage`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// No se exportan el detector de tipos, el escáner de cargas vencidas, el adaptador de auditoría, los repositorios ni
// el emisor interno de URLs (`AccessibleFileUrlIssuer`, 017 plan §2.3).
export { I_PLAN_LIMITS_PROVIDER } from './application/plan-limits';
export type { IPlanLimitsProvider, PlanLimits } from './application/plan-limits';
export { StoragePreviewFacade } from './application/storage-preview.facade';
export type { PreviewDelivery } from './application/storage-preview.facade';
export { NodeNotFoundError } from './domain/errors';
export { StorageModule } from './storage.module';
export { StorageWorkerModule } from './storage-worker.module';
