import type { Actor } from '../../../shared';

/**
 * Condiciones de almacenamiento de la cuenta del actor que consume `storage` mismo (DF-51, opción A; ADR-0032 regla 1):
 * bytes y, desde 006, la retención en papelera (plan 006 §7, decisión 1), desde 007 el nombre visible del plan que el
 * adaptador ya lee en la misma fila (D-20), desde 014 las versiones retenidas por archivo, desde 016 el máximo de
 * editores (DF-73), desde 010 si la cuenta está en solo lectura y, desde 011b, el extra de cuota vigente. Si otro módulo necesita otros límites, los pide por
 * un puerto de `billing` en lugar de ensanchar este tipo (ISP). El renombre del tipo queda en PD-63 (010 M-5).
 */
export interface PlanLimits {
  /** Nombre visible del plan, para «Tu plan» en el resumen de espacio (spec 007 CA-1, D-20). */
  readonly planName: string;
  readonly maxFileBytes: bigint;
  /** Cuota efectiva: la del plan más el extra vigente (011b RN-1). */
  readonly storageQuotaBytes: bigint;
  /**
   * Extra de cuota vigente que ya incluye `storageQuotaBytes` y el instante en que deja de regir (011b RN-1, CA-5); sin
   * extra o vencido, `0` y `null`. El vencimiento lo calcula `billing` al leer, sin job.
   */
  readonly extraQuotaBytes: bigint;
  readonly extraQuotaUntil: Date | null;
  /** Días que un elemento eliminado espera en la papelera antes de la purga (RN-1, CA-19). */
  readonly trashRetentionDays: number;
  /** Versiones que se conservan por archivo, contando la actual (014 RN-4, CA-13). */
  readonly retainedVersions: number;
  /**
   * La suscripción de pago venció sin renovarse (spec 010 RN-5): lo calcula solo `billing`; sin fila o con rol interno,
   * `false` (ADR-0032 regla 5). Lo interpreta solo `WritableAccountPolicy`.
   */
  readonly readOnly: boolean;
  /**
   * Editores simultáneos de un documento (016 RN-3, CA-7); `0` = el plan no incluye edición (Personal). Lo consume
   * `editing` con el actor de la cuenta propietaria: ensanche aceptado en DF-73, como `planName`.
   */
  readonly maxEditors: number;
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
