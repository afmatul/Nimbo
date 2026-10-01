import type { Actor } from '../../../shared';

/**
 * Límites de almacenamiento del plan del actor, en bytes (DF-51, opción A). Solo estos dos: si otro módulo
 * necesita otros límites, los pide por un puerto de `billing` en lugar de ensanchar este tipo (ISP).
 */
export interface PlanLimits {
  readonly maxFileBytes: bigint;
  readonly storageQuotaBytes: bigint;
}

/**
 * Puerto que `storage` declara y `billing` (006a) implementa importándolo de `storage/index.ts`. El enlace del
 * token vive en la raíz de composición (`PlanLimitsBindingModule`), para que `storage` no conozca a `billing`. Ningún
 * valor del catálogo de planes vive en código de producción (RN-1).
 */
export interface IPlanLimitsProvider {
  limitsFor(actor: Actor): Promise<PlanLimits>;
}

export const I_PLAN_LIMITS_PROVIDER = Symbol('IPlanLimitsProvider');
