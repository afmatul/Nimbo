// API pública de `optimizer` para la raíz del proceso `worker-optimizer` (`worker-optimizer.module.ts`, ADR-0037),
// separada de `index.ts` porque `OptimizerWorkerModule` carga `sharp` (binario nativo de libvips) y el `api` nunca debe
// cargarlo (ADR-0036).
export { OptimizerWorkerModule } from './optimizer-worker.module';
export type { OptimizerWorkerEnv } from './optimizer-worker.module';
