import { planCatalogResponseSchema, type PlanCatalogResponse } from '@nimbo/contracts';

import { requestJson } from '../../lib/api-client';
import type { AuthFetch } from '../identity/session/auth-fetch';

import { billingEndpoint } from './billing-endpoint';

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
  return planCatalogResponseSchema.parse(body);
}

/** El mismo catálogo desde el navegador, con la sesión del cliente (010 CA-17, PD-86: solo planes activos). */
export async function fetchPlanCatalogWithSession(
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<PlanCatalogResponse> {
  return planCatalogResponseSchema.parse(
    await authFetch(billingEndpoint(apiPublicUrl, '/billing/plans')),
  );
}
