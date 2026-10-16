import {
  subscribeRequestSchema,
  subscribeResponseSchema,
  type SubscribeRequest,
  type SubscribeResponse,
} from '@nimbo/contracts';

import type { AuthFetch } from '../identity/session/auth-fetch';

import { billingEndpoint } from './billing-endpoint';

const SUBSCRIBE_PATH = '/billing/subscribe';

/**
 * `POST /billing/subscribe` con la sesión (spec 009 CA-3 a CA-5). Un `402`, `400`, `422` o `429` llega como
 * `ApiClientError` con su `code`; la pantalla decide cómo mostrarlo.
 */
export async function subscribe(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  request: SubscribeRequest,
): Promise<SubscribeResponse> {
  const raw = await authFetch(billingEndpoint(apiPublicUrl, SUBSCRIBE_PATH), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscribeRequestSchema.parse(request)),
  });
  return subscribeResponseSchema.parse(raw);
}
