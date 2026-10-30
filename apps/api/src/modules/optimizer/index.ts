// API pública del módulo `optimizer`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5).
// 021: el módulo del `api` (calcular el ahorro, consultar el estado y encolar). El del `worker` se exporta por
// `worker.ts`: importar este barril nunca carga `sharp` (ADR-0037).
export { OptimizerModule } from './optimizer.module';
export type { OptimizerDependencies, OptimizerEnv } from './optimizer.module';
