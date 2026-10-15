import { BillingHttpModule } from '../../../src/modules/billing';
import { StorageModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { ProviderOverride, TestApp } from '../setup/test-app';

/**
 * El `api` de `billing` como lo compone `AppModule` (009): una sola instancia de `StorageModule` que `BillingHttpModule`
 * importa de forma explícita, y el enlace de límites que `storage` necesita.
 */
export const createBillingHttpApp = (
  overrides: readonly ProviderOverride[] = [],
): Promise<TestApp> => {
  const env = buildTestEnv();
  const storage = StorageModule.forRoot(env);
  return createTestApp({
    validatedEnv: env,
    modules: [PlanLimitsBindingModule, storage, BillingHttpModule.forRoot(storage)],
    overrides,
  });
};
