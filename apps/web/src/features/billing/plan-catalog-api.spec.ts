import type { Plan } from '@nimbo/contracts';

import { ApiClientError } from '../../lib/api-error';

import { fetchPlanCatalog } from './plan-catalog-api';

const PERSONAL: Plan = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: null,
  priceCents: 0,
  quotaBytes: '15000000000',
  maxFileBytes: '50000000',
  maxEditors: 0,
  agentQueriesPerMonth: 20,
  retainedVersions: 3,
  trashRetentionDays: 7,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchPlanCatalog (008 CA-1, CA-3)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1: consulta el catálogo con el prefijo de la API sobre la URL interna', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ plans: [PERSONAL] }));

    await expect(fetchPlanCatalog('http://internal.test')).resolves.toEqual({
      plans: [PERSONAL],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://internal.test/api/v1/billing/plans');
  });

  it('CA-3: un 500 de la API se rechaza con su código', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: 'BILLING_PLAN_CATALOG_UNAVAILABLE', message: 'x', correlationId: 'c-1' },
        500,
      ),
    );

    await expect(fetchPlanCatalog('http://internal.test')).rejects.toMatchObject({
      code: 'BILLING_PLAN_CATALOG_UNAVAILABLE',
    });
  });

  it('CA-3: un cuerpo fuera del contrato se rechaza', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ plans: [{ id: 'x' }] }));

    await expect(fetchPlanCatalog('http://internal.test')).rejects.toThrow();
  });

  it('CA-3: la red caída se rechaza con el error genérico del cliente', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchPlanCatalog('http://internal.test')).rejects.toBeInstanceOf(ApiClientError);
  });
});
