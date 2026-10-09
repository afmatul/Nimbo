import type { PlanDto } from '@nimbo/contracts';

import { loadPlanCatalog } from './plan-catalog';

const PLAN: Omit<PlanDto, 'id' | 'slug' | 'nombre' | 'precioCentavos'> = {
  descripcion: null,
  cuotaBytes: '1',
  maxArchivoBytes: '1',
  maxEditores: 0,
  consultasAgenteMensual: 0,
  versionesRetenidas: 0,
  diasRetencionPapelera: 0,
};
const PERSONAL: PlanDto = {
  ...PLAN,
  id: 'p-1',
  slug: 'personal',
  nombre: 'Personal',
  precioCentavos: 0,
};
const PRO: PlanDto = { ...PLAN, id: 'p-2', slug: 'pro', nombre: 'Pro', precioCentavos: 4500 };

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
    fetchMock.mockResolvedValue(jsonResponse({ planes: [PERSONAL, PRO] }));

    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual({
      plans: [
        { id: 'p-1', name: 'Personal', priceCents: 0, free: true },
        { id: 'p-2', name: 'Pro', priceCents: 4500, free: false },
      ],
      unavailable: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://internal.test/api/v1/billing/plans');
  });

  it('corta la espera a los 2 s con una señal de tiempo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ planes: [] }));

    await loadPlanCatalog('http://internal.test');

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('un 500, un cuerpo inválido, la red caída o el tiempo agotado dejan el catálogo no disponible', async () => {
    const unavailable = { plans: [], unavailable: true };

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'PLAN_CATALOG_UNAVAILABLE', message: 'x', correlationId: 'c' }, 500),
    );
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockResolvedValueOnce(jsonResponse({ planes: [{ id: 'x' }] }));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);

    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(loadPlanCatalog('http://internal.test')).resolves.toEqual(unavailable);
  });
});
