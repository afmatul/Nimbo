import type { PlanDto } from '@nimbo/contracts';

import { fetchPlanCatalog } from '../billing';

import type { CatalogPlan } from './components/plan-picker';

/** El registro no espera más de 2 s al catálogo: sin él, el formulario sigue con «catálogo no disponible». */
const CATALOG_TIMEOUT_MS = 2_000;

export interface PlanCatalog {
  readonly plans: readonly CatalogPlan[];
  readonly unavailable: boolean;
}

const toCatalogPlan = (plan: PlanDto): CatalogPlan => ({
  id: plan.id,
  name: plan.nombre,
  priceCents: plan.precioCentavos,
  free: plan.precioCentavos === 0,
});

/** Catálogo público de la 008 adaptado al selector del registro (PD-48). Cualquier fallo deja el catálogo no disponible. */
export async function loadPlanCatalog(apiInternalUrl: string): Promise<PlanCatalog> {
  try {
    const { planes } = await fetchPlanCatalog(apiInternalUrl, {
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    });
    return { plans: planes.map(toCatalogPlan), unavailable: false };
  } catch {
    return { plans: [], unavailable: true };
  }
}
