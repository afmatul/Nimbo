import type { Plan } from '@nimbo/contracts';

import { loadPlanCatalog } from './plan-catalog';

const PLAN: Omit<Plan, 'id' | 'slug' | 'name' | 'priceCents'> = {
  description: null,
  quotaBytes: '1',
  maxFileBytes: '1',
  maxEditors: 0,
  agentQueriesPerMonth: 0,
  retainedVersions: 0,
  trashRetentionDays: 0,
};
const PERSONAL: Plan = {
  ...PLAN,
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  priceCents: 0,
};
const PRO: Plan = { ...PLAN, id: '00000000-0000-4000-8000-000000000002', slug: 'pro', name: 'Pro', priceCents: 4500 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('plan-catalog (PD-48: lee el catálogo de la 008)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('lee GET /api/v1/billing/plans y lo adapta al selector de planes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ plans: [PERSONAL, PRO] }));

    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual({
      plans: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Personal', priceCents: 0, free: true },
        { id: '00000000-0000-4000-8000-000000000002', name: 'Pro', priceCents: 4500, free: false },
      ],
      unavailable: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://internal.test/api/v1/billing/plans');
  });

  it('corta la espera a los 2 s con una señal de tiempo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ plans: [] }));

    await loadPlanCatalog('http://internal.test');

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('un 500, un cuerpo inválido, la red caída o el tiempo agotado dejan el catálogo no disponible', async () => {
    const unavailable = { plans: [], unavailable: true };

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { code: 'BILLING_PLAN_CATALOG_UNAVAILABLE', message: 'x', correlationId: 'c' },
        500,
      ),
    );
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockResolvedValueOnce(jsonResponse({ plans: [{ id: 'x' }] }));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);
  });
});
