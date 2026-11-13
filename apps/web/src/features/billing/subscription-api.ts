import {
  paymentReceiptSchema,
  renewRequestSchema,
  subscriptionViewSchema,
  type RenewRequest,
  type RenewResponse,
  type SubscriptionView,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { billingEndpoint } from './billing-endpoint';
import { planChangeResponseSchema, type PlanChangeResponse } from './plan-change-result';

const AUTO_RENEW_PATH = '/billing/subscription/auto-renew';
const PLAN_CHANGE_PATH = '/billing/subscription/plan-change';
const RENEW_PATH = '/billing/renew';

const send = async (
  apiPublicUrl: string,
  authFetch: AuthFetch,
  request: { readonly path: string; readonly method: 'PUT' | 'DELETE'; readonly body?: object },
): Promise<SubscriptionView> => {
  const raw = await authFetch(billingEndpoint(apiPublicUrl, request.path), {
    method: request.method,
    ...(request.body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) }),
  });
  return subscriptionViewSchema.parse(raw);
};

/** `PUT /billing/subscription/auto-renew` (spec 010 CA-6): la vista nueva de la suscripción. */
export const setAutoRenew = (
  apiPublicUrl: string,
  authFetch: AuthFetch,
  enabled: boolean,
): Promise<SubscriptionView> =>
  send(apiPublicUrl, authFetch, { path: AUTO_RENEW_PATH, method: 'PUT', body: { enabled } });

/**
 * `PUT /billing/subscription/plan-change` (spec 010 CA-16, CA-17, CA-27): programa (o aplica ya) el plan del siguiente
 * ciclo. Que se aplique en la próxima fecha de cobro es un resultado válido (`result.kind`), no un error.
 */
export async function schedulePlanChange(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  planSlug: string,
): Promise<PlanChangeResponse> {
  const raw = await authFetch(billingEndpoint(apiPublicUrl, PLAN_CHANGE_PATH), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planSlug }),
  });
  return planChangeResponseSchema.parse(raw);
}

/** `DELETE /billing/subscription/plan-change` (spec 010 CA-19): sin cambio programado es `404` con su código. */
export const cancelPlanChange = (
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<SubscriptionView> =>
  send(apiPublicUrl, authFetch, { path: PLAN_CHANGE_PATH, method: 'DELETE' });

/**
 * `POST /billing/renew` (spec 010 CA-8 a CA-11, CA-26, CA-28): el mismo recibo que contratar. Un `402`, `409`, `422` o
 * `429` llega como `ApiClientError` con su `code`.
 */
export async function renew(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  request: RenewRequest,
): Promise<RenewResponse> {
  const raw = await authFetch(billingEndpoint(apiPublicUrl, RENEW_PATH), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(renewRequestSchema.parse(request)),
  });
  return paymentReceiptSchema.parse(raw);
}
