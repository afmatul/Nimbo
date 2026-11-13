import type { Plan } from '@nimbo/contracts';
import { renderToStaticMarkup } from 'react-dom/server';

import ContratarPage from './page';

jest.mock('../../../../../features/billing/components/payment-form', () => ({
  SessionPaymentForm: ({ plan }: { readonly plan: Plan }) => (
    <p>Formulario de pago de {plan.slug}</p>
  ),
}));

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
const TEAM: Plan = {
  ...PERSONAL,
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  priceCents: 11_000,
};

async function renderWith(slug: string | undefined): Promise<string> {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ plans: [PERSONAL, TEAM] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  return renderToStaticMarkup(await ContratarPage({ searchParams: Promise.resolve({ slug }) }));
}

describe('página de pago /planes/contratar (spec 009 CA-9, §6)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://api.internal:3000';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-9: con el `slug` de un plan de pago muestra su formulario y lee el catálogo por la URL interna', async () => {
    const html = await renderWith('equipo');

    expect(html).toContain('Formulario de pago de equipo');
    expect(html).toContain('Volver a planes');
    expect(String(jest.mocked(global.fetch).mock.calls[0]?.[0])).toBe(
      'http://api.internal:3000/api/v1/billing/plans',
    );
  });

  it.each(['personal', 'no-existe', undefined])(
    'CA-5: el plan «%s» no se contrata y lo dice',
    async (slug) => {
      const html = await renderWith(slug);

      expect(html).toContain(
        'Este plan no está disponible para contratar. Elige otro plan en Planes.',
      );
      expect(html).not.toContain('Formulario de pago');
    },
  );
});
