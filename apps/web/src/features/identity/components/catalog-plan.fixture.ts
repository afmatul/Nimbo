import type { CatalogPlan } from './plan-picker';

/** Plan de catálogo para pruebas: límites de relleno y lo que cada prueba necesita sobreescribir. */
export function catalogPlan(
  patch: Pick<CatalogPlan, 'id' | 'name' | 'priceCents'> & Partial<CatalogPlan>,
): CatalogPlan {
  return {
    slug: patch.id,
    description: null,
    quotaBytes: '15000000000',
    maxFileBytes: '50000000',
    maxEditors: 0,
    agentQueriesPerMonth: 10,
    retainedVersions: 3,
    trashRetentionDays: 7,
    free: patch.priceCents === 0,
    ...patch,
  };
}
