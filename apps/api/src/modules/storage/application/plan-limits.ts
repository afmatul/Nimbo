import type { Actor } from '../../../shared';

/**
 * Límites de almacenamiento del plan del actor (DF-51, opción A): bytes y, desde 006, la retención en papelera
 * (plan 006 §7, decisión 1: es un límite de almacenamiento que consume `storage` mismo) y, desde 007, el nombre
 * visible del plan que el adaptador ya lee en la misma fila (D-20), desde 014, las versiones retenidas por archivo (mismo precedente) y, desde 016, el máximo de editores (DF-73). Si otro módulo necesita
 * otros límites, los pide por un puerto de `billing` en lugar de ensanchar este tipo (ISP).
 */
export interface PlanLimits {
  /** Nombre visible del plan, para «Tu plan» en el resumen de espacio (spec 007 CA-1, D-20). */
  readonly planName: string;
  readonly maxFileBytes: bigint;
  readonly storageQuotaBytes: bigint;
  /** Días que un elemento eliminado espera en la papelera antes de la purga (RN-1, CA-19). */
  readonly trashRetentionDays: number;
  /** Versiones que se conservan por archivo, contando la actual (014 RN-4, CA-13). */
  readonly retainedVersions: number;
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
