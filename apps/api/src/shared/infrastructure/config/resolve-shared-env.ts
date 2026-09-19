import type { z } from 'zod';

import { apiEnvSchema, workerEnvSchema } from './env.schema';
import type { Env } from './env.schema';
import { loadEnv } from './load-env';
import type { EnvSource } from './load-env';

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Lo que `SharedModule` provee bajo `ENV`: el contrato de `api` o, si el entorno no trae `MINIO_*`, el del `worker`. */
export type SharedEnv = Env | WorkerEnv;

export const hasMinioConfig = (env: SharedEnv): env is Env => 'MINIO_ENDPOINT' in env;

/**
 * `SharedModule` no recibe parámetros (plan 000 §11.3 cambio 3) pero sirve a dos procesos con contratos
 * distintos; provee el contrato más completo que el entorno satisface. `main.ts` de cada proceso ya validó
 * el suyo antes de arrancar, así que aquí solo se tipa. Cuando el worker necesite MinIO (019/021) ambos
 * contratos convergen y esta elección desaparece.
 */
export const resolveSharedEnv = (source: EnvSource = process.env): SharedEnv => {
  const api = loadEnv(apiEnvSchema, source);
  if (api.ok) {
    return api.env;
  }
  const worker = loadEnv(workerEnvSchema, source);
  if (worker.ok) {
    return worker.env;
  }
  throw new Error(`Configuración inválida: ${worker.issues.join('; ')}`);
};
