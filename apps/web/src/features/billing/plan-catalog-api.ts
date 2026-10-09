import { PlanCatalogResponseSchema, type PlanCatalogResponse } from '@nimbo/contracts';

import { requestJson } from '../../lib/api-client';

const PLAN_CATALOG_PATH = '/api/v1/billing/plans';

/**
 * `GET /billing/plans` desde el servidor (008 CA-1). Un error de la API, la red caída, el tiempo agotado (`init.signal`) o un
 * cuerpo fuera del contrato se rechazan; cada pantalla decide cómo mostrarlo (CA-3).
 */
export async function fetchPlanCatalog(
  apiInternalUrl: string,
  init: Pick<RequestInit, 'signal'> = {},
): Promise<PlanCatalogResponse> {
  const body = await requestJson(`${apiInternalUrl}${PLAN_CATALOG_PATH}`, init);
  return PlanCatalogResponseSchema.parse(body);
}
