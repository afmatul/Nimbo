import { z } from 'zod';

import type { CatalogPlan } from './components/plan-picker';

/**
 * Lectura pública del catálogo de 006a (PD-40). El contrato aún no está en `packages/contracts`:
 * la ruta provisional es `GET {API_INTERNAL_URL}/plans`. Cualquier fallo cae en catalogo-no-disponible.
 */
const CATALOG_PATH = '/plans';
const CATALOG_TIMEOUT_MS = 2_000;

const catalogPlanSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
    free: z.boolean(),
  })
  .strict();

const catalogResponseSchema = z.object({ plans: z.array(catalogPlanSchema) }).strict();

export interface PlanCatalog {
  readonly plans: readonly CatalogPlan[];
  readonly unavailable: boolean;
}

export async function loadPlanCatalog(
  apiInternalUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlanCatalog> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${apiInternalUrl.replace(/\/$/, '')}${CATALOG_PATH}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { plans: [], unavailable: true };
    const parsed = catalogResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { plans: [], unavailable: true };
    return { plans: parsed.data.plans, unavailable: false };
  } catch {
    return { plans: [], unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}
