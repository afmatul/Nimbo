import { Global, Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';

import { BillingModule, PlanLimitsAdapter } from '../modules/billing';
import { I_PLAN_LIMITS_PROVIDER } from '../modules/storage';
import { PlanLimitsBindingModule } from '../plan-limits-binding.module';
import type { Env } from '../shared';

import { DevPaidPlanLimitsProvider } from './dev-paid-plan.provider';
import type { DevPaidPlanSlug } from './dev-paid-plan.provider';

/** Lo que decide el andamiaje: el plan forzado y el ambiente. */
export type DevPaidPlanEnv = Pick<Env, 'APP_ENV' | 'DEV_FORCE_PAID_PLAN'>;

/** Segunda barrera (la primera es `env.schema.ts`): fuera de local o test, el andamiaje no arranca. */
const ALLOWED_ENVIRONMENTS: readonly string[] = ['local', 'test'];

/**
 * ANDAMIAJE TEMPORAL (016 RN-13, plan §2.1): enlaza `I_PLAN_LIMITS_PROVIDER` a un plan de pago fijo para la demo de
 * edición mientras todas las cuentas son Personal (hasta 009/010). Global, como `PlanLimitsBindingModule`. Se borra al
 * terminar la spec (T-11) junto con `DEV_FORCE_PAID_PLAN`; las pruebas no dependen de él.
 */
@Global()
@Module({})
export class DevPaidPlanBindingModule {
  static forRoot(slug: DevPaidPlanSlug, appEnv: string): DynamicModule {
    if (!ALLOWED_ENVIRONMENTS.includes(appEnv)) {
      throw new Error(
        'DEV_FORCE_PAID_PLAN es un andamiaje de desarrollo: no se admite fuera de local o test.',
      );
    }
    return {
      module: DevPaidPlanBindingModule,
      imports: [BillingModule],
      providers: [
        {
          provide: I_PLAN_LIMITS_PROVIDER,
          inject: [PlanLimitsAdapter],
          useFactory: (plans: PlanLimitsAdapter) => new DevPaidPlanLimitsProvider(plans, slug),
        },
      ],
      exports: [I_PLAN_LIMITS_PROVIDER],
    };
  }
}

/** El enlace de límites de la raíz: el andamiaje si `DEV_FORCE_PAID_PLAN` está definida y, si no, el real. */
export const planLimitsBinding = (env: DevPaidPlanEnv): Type<unknown> | DynamicModule =>
  env.DEV_FORCE_PAID_PLAN === undefined
    ? PlanLimitsBindingModule
    : DevPaidPlanBindingModule.forRoot(env.DEV_FORCE_PAID_PLAN, env.APP_ENV);
