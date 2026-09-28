import { loadPlanCatalog } from './plan-catalog';

const PERSONAL = { id: 'personal', name: 'Personal', priceCents: 0, free: true };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('plan-catalog', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lee los planes activos de la ruta provisional de 006a', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ plans: [PERSONAL] }));

    await expect(loadPlanCatalog('http://internal.test/api/v1/', fetchMock)).resolves.toEqual({
      plans: [PERSONAL],
      unavailable: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://internal.test/api/v1/plans');
  });

  it('un 404, un cuerpo inválido o un fallo de red dejan el catálogo no disponible', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'no' }, 404));
    await expect(loadPlanCatalog('http://internal.test/api/v1', fetchMock)).resolves.toEqual({
      plans: [],
      unavailable: true,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ plans: [{ id: 'x' }] }));
    await expect(loadPlanCatalog('http://internal.test/api/v1', fetchMock)).resolves.toEqual({
      plans: [],
      unavailable: true,
    });

    fetchMock.mockRejectedValueOnce(new Error('red'));
    await expect(loadPlanCatalog('http://internal.test/api/v1', fetchMock)).resolves.toEqual({
      plans: [],
      unavailable: true,
    });
  });

  it('a los 2 s corta la espera y deja el catálogo no disponible', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const pending = loadPlanCatalog('http://internal.test/api/v1', fetchMock);
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toEqual({ plans: [], unavailable: true });
    jest.useRealTimers();
  });
});
