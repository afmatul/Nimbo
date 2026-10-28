// API pública de `optimizer` para la composición del `worker` (`worker.module.ts`), separada de `index.ts` porque
// `OptimizerWorkerModule` carga `sharp` (binario nativo de libvips) y el `api` nunca debe cargarlo (ADR-0036).
export { OptimizerWorkerModule } from './optimizer-worker.module';
export type { OptimizerWorkerEnv } from './optimizer-worker.module';
