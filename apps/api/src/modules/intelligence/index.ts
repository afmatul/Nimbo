// API pública del módulo `intelligence`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// Solo los módulos que montan las raíces de composición (`api` y `worker`), el gancho de la conciliación (RN-12) que usan
// el script del Operador `index:reconcile` y, cuando exista el corpus, `pnpm seed` (D-5), y el lector de coincidencia
// por contenido que la raíz enlaza al puerto de `storage` (018b D-1, como `billing` con `PlanLimitsAdapter`); nada más
// de infraestructura.
export { IntelligenceModule } from './intelligence.module';
export type { IntelligenceDependencies, IntelligenceEnv } from './intelligence.module';
export { IntelligenceWorkerModule } from './intelligence-worker.module';
export type { IntelligenceWorkerEnv } from './intelligence-worker.module';
export {
  INDEX_RECONCILE_QUEUE,
  requestIndexReconcile,
} from './infrastructure/index-reconcile.scheduler';
export { SqlContentMatchReader } from './infrastructure/persistence/sql-content-match.reader';
