import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { cancelPlanChange, setAutoRenew } from './subscription-api';

const API = 'http://localhost/api/v1/';
const VIEW = {
  plan: {
    id: '10000000-0000-4000-8000-000000000003',
    slug: 'equipo',
    name: 'Equipo',
    description: null,
    priceCents: 11_000,
    quotaBytes: '375809638400',
    maxFileBytes: '1073741824',
    maxEditors: 5,
    agentQueriesPerMonth: 2000,
    retainedVersions: 60,
    trashRetentionDays: 60,
  },
  expiresAt: '2026-11-04T18:00:00.000Z',
  status: 'active',
  autoRenew: false,
  pendingPlan: null,
  nextCharge: null,
  renewal: null,
};

describe('subscription-api (spec 010 CA-6, CA-19)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-6: PUT con `{ enabled }` y JSON, y valida la vista que responde', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(VIEW));

    await expect(setAutoRenew(API, authFetch, false)).resolves.toMatchObject({ autoRenew: false });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost/api/v1/billing/subscription/auto-renew');
    expect(init).toMatchObject({ method: 'PUT', body: JSON.stringify({ enabled: false }) });
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });

  it('CA-19: DELETE sin cuerpo; un 404 llega con su código', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_NO_PENDING_PLAN_CHANGE', 404));

    await expect(cancelPlanChange(API, authFetch)).rejects.toMatchObject({
      code: 'BILLING_NO_PENDING_PLAN_CHANGE',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost/api/v1/billing/subscription/plan-change');
    expect(init).toMatchObject({ method: 'DELETE' });
    expect(init?.body).toBeUndefined();
  });

  it('la referencia del instrumento no cabe en la vista (lista blanca, ADR-0031)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...VIEW, instrumentRef: 'SIM-TOK-ok-1' }));

    await expect(setAutoRenew(API, authFetch, true)).rejects.toThrow();
  });
});
