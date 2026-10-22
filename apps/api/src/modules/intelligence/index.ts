// API pública del módulo `intelligence`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// Solo los módulos que montan las raíces de composición; nada de infraestructura se exporta. El `worker` suma
// `IntelligenceWorkerModule` en la T-06.
export { IntelligenceModule } from './intelligence.module';
export type { IntelligenceDependencies, IntelligenceEnv } from './intelligence.module';
