import type { IPlanLimitsProvider, PlanLimits } from '../../src/modules/storage';
import type { Actor } from '../../src/shared';

/** Límites de prueba por defecto: una cuenta vigente (010 `readOnly` falso). */
const WRITABLE_TEST_LIMITS: PlanLimits = {
  planName: 'Plan de prueba',
  maxFileBytes: 100n,
  storageQuotaBytes: 1000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
  maxEditors: 0,
  readOnly: false,
};

/**
 * Doble de `IPlanLimitsProvider` mientras 006a no lo implemente (R-3). Solo en `test/`: el código de producción
 * no tiene valores del catálogo de planes (RN-1). Devuelve los límites que la prueba le pasa y, con `setReadOnly`, la
 * cuenta en solo lectura de la 010 (ADR-0032).
 */
export class FakePlanLimitsProvider implements IPlanLimitsProvider {
  private limits: PlanLimits;
  private readonly requested: string[] = [];

  constructor(limits: PlanLimits = WRITABLE_TEST_LIMITS) {
    this.limits = { ...limits };
  }

  get requestedFor(): readonly string[] {
    return [...this.requested];
  }

  setLimits(limits: PlanLimits): void {
    this.limits = { ...limits };
  }

  setReadOnly(readOnly: boolean): void {
    this.limits = { ...this.limits, readOnly };
  }

  limitsFor(actor: Actor): Promise<PlanLimits> {
    this.requested.push(actor.id);
    return Promise.resolve({ ...this.limits });
  }
}
