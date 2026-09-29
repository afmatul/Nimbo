import { saveExpiring, takeExpiring } from './expiring-storage';

const STORAGE_KEY = 'nimbo.registro.plan';
const FIELDS = ['planId', 'planName'] as const;

export interface ChosenPlan {
  readonly planId: string;
  readonly planName: string;
}

/** Guarda solo el plan. No persiste correo ni nombre (D-24). Sin `localStorage`, no hace nada. */
export function saveChosenPlan(storage: Storage | undefined, plan: ChosenPlan, now: Date): void {
  saveExpiring(storage, STORAGE_KEY, { planId: plan.planId, planName: plan.planName }, now);
}

/**
 * Lee el plan si tiene menos de 24 h y lo borra. Caducado, ausente o sin almacenamiento → `null`.
 */
export function takeChosenPlan(storage: Storage | undefined, now: Date): ChosenPlan | null {
  return takeExpiring(storage, STORAGE_KEY, FIELDS, now);
}
