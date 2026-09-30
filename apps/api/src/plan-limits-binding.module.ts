import { Global, Module } from '@nestjs/common';

import { BillingModule, PlanLimitsAdapter } from './modules/billing';
import { I_PLAN_LIMITS_PROVIDER } from './modules/storage';

/**
 * Raíz de composición del puerto de límites (plan 005 §6, spec 006a). `storage` lo declara y no conoce a
 * `billing`, así que el enlace vive aquí y es global para que `StorageModule` y el `worker` lo resuelvan.
 */
@Global()
@Module({
  imports: [BillingModule],
  providers: [{ provide: I_PLAN_LIMITS_PROVIDER, useExisting: PlanLimitsAdapter }],
  exports: [I_PLAN_LIMITS_PROVIDER],
})
export class PlanLimitsBindingModule {}
