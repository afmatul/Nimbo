const STORAGE_KEY = 'nimbo.registro.plan';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ChosenPlan {
  readonly planId: string;
  readonly planName: string;
}

interface StoredChosenPlan extends ChosenPlan {
  readonly savedAt: string;
}

function isStored(value: unknown): value is StoredChosenPlan {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['planId'] === 'string' &&
    typeof record['planName'] === 'string' &&
    typeof record['savedAt'] === 'string' &&
    Object.keys(record).every((key) => key === 'planId' || key === 'planName' || key === 'savedAt')
  );
}

/** Guarda solo el plan. No persiste correo ni nombre (D-24). Sin `localStorage`, no hace nada. */
export function saveChosenPlan(
  storage: Storage | undefined,
  plan: ChosenPlan,
  now: Date,
): void {
  storage?.setItem(
    STORAGE_KEY,
    JSON.stringify({ planId: plan.planId, planName: plan.planName, savedAt: now.toISOString() }),
  );
}

/**
 * Lee el plan si tiene menos de 24 h y lo borra. Caducado, ausente o sin almacenamiento → `null`.
 */
export function takeChosenPlan(storage: Storage | undefined, now: Date): ChosenPlan | null {
  if (storage === undefined) return null;
  const raw = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isStored(parsed)) return null;
  const savedAt = Date.parse(parsed.savedAt);
  if (Number.isNaN(savedAt) || now.getTime() - savedAt >= MAX_AGE_MS) return null;
  return { planId: parsed.planId, planName: parsed.planName };
}
