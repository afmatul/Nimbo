// API pública del módulo `intelligence`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// Solo los módulos que montan las raíces de composición (`api` y `worker`); nada de infraestructura se exporta.
export { IntelligenceModule } from './intelligence.module';
export type { IntelligenceDependencies, IntelligenceEnv } from './intelligence.module';
export { IntelligenceWorkerModule } from './intelligence-worker.module';
export type { IntelligenceWorkerEnv } from './intelligence-worker.module';
