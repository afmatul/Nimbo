import { workerOptimizerEnvSchema } from '../../src/shared';
import type { Env } from '../../src/shared';
import type { WorkerOptimizerEnv } from '../../src/worker-base';
import { buildTestEnv } from '../int/setup/test-app';

/** El arnés HTTP necesita `Env`; los módulos del optimizador se validan con su esquema, nunca con el del general. */
export const buildOptimizerTestEnv = (
  overrides: Readonly<Record<string, string>> = {},
): Env & WorkerOptimizerEnv => {
  const api = buildTestEnv(overrides);
  const optimizer = workerOptimizerEnvSchema.parse({ ...process.env, ...api, ...overrides });
  return { ...api, ...optimizer };
};
