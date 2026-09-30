import { Global, Injectable, Module } from '@nestjs/common';

import { I_PLAN_LIMITS_PROVIDER } from './modules/storage';
import type { IPlanLimitsProvider, PlanLimits } from './modules/storage';

/**
 * Enlace provisional de `IPlanLimitsProvider` hasta que 006a lo implemente en `billing` (DF-51, opción A; plan 005
 * R-3). No tiene valores del catálogo de planes (RN-1): falla cerrado, así ninguna carga se acepta con límites
 * inventados. Las pruebas lo sustituyen por `FakePlanLimitsProvider` (`test/support`).
 */
@Injectable()
export class PendingPlanLimitsProvider implements IPlanLimitsProvider {
  limitsFor(): Promise<PlanLimits> {
    return Promise.reject(
      new Error('IPlanLimitsProvider sin implementación: la entrega la spec 006a (billing).'),
    );
  }
}

/**
 * Raíz de composición del puerto de límites (plan 005 §6): `storage` lo declara y no conoce a `billing`, así que el
 * enlace vive aquí y es global para que `StorageModule` lo resuelva. Con 006a, `useClass` pasa a su implementación.
 */
@Global()
@Module({
  providers: [{ provide: I_PLAN_LIMITS_PROVIDER, useClass: PendingPlanLimitsProvider }],
  exports: [I_PLAN_LIMITS_PROVIDER],
})
export class PlanLimitsBindingModule {}
