import { ContentMatchBindingModule } from '../../../src/content-match-binding.module';
import { ExplorerBadgesBindingModule } from '../../../src/explorer-badges-binding.module';
import { BillingHttpModule } from '../../../src/modules/billing';
import { StorageModule } from '../../../src/modules/storage';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { clearMailQueue } from '../../support/mail-queue';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { ProviderOverride, TestApp } from '../setup/test-app';

/**
 * El `api` de `billing` como lo compone `AppModule` (009): una sola instancia de `StorageModule` que `BillingHttpModule`
 * importa de forma explícita, y el enlace de límites que `storage` necesita. Al cerrarla se vacía la cola `mail`: el cobro
 * encola comprobantes que nadie consume aquí y no deben llegarle a otra suite (PR #62).
 */
export const createBillingHttpApp = async (
  overrides: readonly ProviderOverride[] = [],
): Promise<TestApp> => {
  const env = buildTestEnv();
  const storage = StorageModule.forRoot(env);
  const testApp = await createTestApp({
    validatedEnv: env,
    modules: [
      PlanLimitsBindingModule,
      ContentMatchBindingModule,
      ExplorerBadgesBindingModule,
      storage,
      BillingHttpModule.forRoot(env, storage),
    ],
    overrides,
  });
  return {
    ...testApp,
    close: async () => {
      await testApp.close();
      await clearMailQueue();
    },
  };
};
