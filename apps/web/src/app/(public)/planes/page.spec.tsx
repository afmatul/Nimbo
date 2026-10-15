import type { Plan } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import PlanesPage from './page';

const PRO: Plan = {
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: 'Plan profesional',
  priceCents: 4500,
  quotaBytes: '107374182400',
  maxFileBytes: '524288000',
  maxEditors: 3,
  agentQueriesPerMonth: 500,
  retainedVersions: 30,
  trashRetentionDays: 30,
};

function respondWith(plans: readonly Plan[]): void {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ plans }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await PlanesPage());
}

describe('página de planes (008 CA-1, CA-2)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-1: lee el catálogo desde el servidor por la URL interna', async () => {
    respondWith([PRO]);

    await renderPage();

    expect(String(jest.mocked(global.fetch).mock.calls[0]?.[0])).toBe(
      'http://internal.test/api/v1/billing/plans',
    );
  });

  it('CA-2: muestra las tarjetas y la tabla con los planes del catálogo', async () => {
    respondWith([PRO]);

    const markup = await renderPage();

    expect(markup).toContain('Elige tu plan');
    expect(markup).toContain('Pro');
    expect(markup).toContain('Plan profesional');
  });

  it('vacío: sin planes muestra «Ahora no hay planes para mostrar.»', async () => {
    respondWith([]);

    const markup = await renderPage();

    expect(markup).toContain('Ahora no hay planes para mostrar.');
    expect(markup).not.toContain('<table');
  });

  it('CA-3: si la API falla, la página lanza para que la muestre su error.tsx', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(PlanesPage()).rejects.toThrow();
  });
});
