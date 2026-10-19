import { subscriptionViewSchema, type SubscriptionView } from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { billingEndpoint } from './billing-endpoint';

const AUTO_RENEW_PATH = '/billing/subscription/auto-renew';
const PLAN_CHANGE_PATH = '/billing/subscription/plan-change';

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

/** `PUT /billing/subscription/plan-change` (spec 010 CA-16, CA-17, CA-27): programa (o aplica ya) el plan del siguiente ciclo. */
export const schedulePlanChange = (
  apiPublicUrl: string,
  authFetch: AuthFetch,
  planSlug: string,
): Promise<SubscriptionView> =>
  send(apiPublicUrl, authFetch, { path: PLAN_CHANGE_PATH, method: 'PUT', body: { planSlug } });

/** `DELETE /billing/subscription/plan-change` (spec 010 CA-19): sin cambio programado es `404` con su código. */
export const cancelPlanChange = (
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<SubscriptionView> =>
  send(apiPublicUrl, authFetch, { path: PLAN_CHANGE_PATH, method: 'DELETE' });
