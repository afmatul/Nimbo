/**
 * @jest-environment jsdom
 */
import type { BillingHistoryResponse } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { PlanAndBilling } from '../../../../features/billing/components/plan-and-billing';
import { createAuthFetch } from '../../../../features/identity/session/auth-fetch';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';
import { errorResponse, jsonResponse } from '../../../../lib/test-http';

const API = 'http://localhost/api/v1';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const TEAM = {
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  description: 'Para equipos',
  priceCents: 11_000,
  quotaBytes: '375809638400',
  maxFileBytes: '1073741824',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 60,
  trashRetentionDays: 60,
};
const PERSONAL = {
  ...TEAM,
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  priceCents: 0,
  maxEditors: 0,
};
const APPROVED = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-10-14T18:00:00.000Z',
  reference: 'SIM-2026-000008',
  planName: 'Equipo',
  amountCents: 11_000,
  status: 'aprobada' as const,
  invoice: { id: INVOICE_ID, number: 'NB-2026-0042', downloadable: true },
};
const REJECTED = {
  ...APPROVED,
  id: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-10-14T17:00:00.000Z',
  reference: 'SIM-2026-000007',
  status: 'rechazada' as const,
  invoice: null,
};
const HISTORY: BillingHistoryResponse = {
  subscription: { plan: TEAM, expiresAt: '2026-11-13T18:00:00.000Z' },
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: { nit: '12345678', receiptEmail: 'ana@ejemplo.com' },
  payments: [APPROVED, REJECTED],
};

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

describe('Plan y facturación, /suscripcion (spec 009 CA-7, CA-8, §6; mockup `billing/suscripcion/`)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });
  const openUrl = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    openUrl.mockReset();
    global.fetch = fetchMock;
  });

  const renderPage = (): ReturnType<typeof render> =>
    render(
      <PlanAndBilling
        apiPublicUrl={API}
        authFetch={authFetch}
        openUrl={openUrl}
        space={{ status: 'ready', summary: spaceSummaryWith(4.8 * GB) }}
      />,
    );
  const plan = () => screen.getByRole('region', { name: /Nimbo/ });
  const invoices = () => screen.getByRole('region', { name: 'Pagos y facturas' });

  it('cargando: muestra el estado de carga mientras llega el historial', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByText('Cargando tu plan y tus facturas…')).toBeTruthy();
  });

  it('CA-7, con facturas: el plan con precio, límites, vencimiento y tarjeta, como el mockup', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Nimbo Equipo' })).toBeTruthy();
    expect(within(plan()).getByText('Plan actual')).toBeTruthy();
    expect(within(plan()).getAllByText('Q110.00')).toHaveLength(2);
    expect(
      within(plan()).getByText('350 GB · 1 GB por archivo · 5 editores simultáneos por documento'),
    ).toBeTruthy();
    expect(within(plan()).getByText('13 de noviembre de 2026')).toBeTruthy();
    expect(within(plan()).getByText('Visa ···· 4242')).toBeTruthy();
    expect(within(plan()).getByRole('link', { name: 'Ver comparativa' }).getAttribute('href')).toBe(
      '/planes',
    );
    expect(screen.getByRole('navigation', { name: 'Ruta' }).textContent).toContain(
      'Plan y facturación',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/billing/history`);
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-7: cada pago con fecha, factura y estado, plan, referencia y monto; el rechazo sin descarga', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));

    renderPage();
    await screen.findByRole('heading', { name: 'Nimbo Equipo' });
    const [approved, rejected] = within(invoices()).getAllByRole('listitem');

    expect(within(approved as HTMLElement).getByText('14 de octubre de 2026')).toBeTruthy();
    expect(within(approved as HTMLElement).getByText('NB-2026-0042 · Pagada')).toBeTruthy();
    expect(within(approved as HTMLElement).getByText('Equipo · SIM-2026-000008')).toBeTruthy();
    expect(within(approved as HTMLElement).getByText('Q110.00')).toBeTruthy();
    expect(within(rejected as HTMLElement).getByText('Pago rechazado')).toBeTruthy();
    expect(within(rejected as HTMLElement).queryByRole('button')).toBeNull();
    expect(within(invoices()).getByText('Las facturas se envían a ana@ejemplo.com.')).toBeTruthy();
  });

  it('mockup: consumo del plan, método de pago y datos de facturación con datos reales', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));

    renderPage();
    await screen.findByRole('heading', { name: 'Nimbo Equipo' });
    const usage = screen.getByRole('region', { name: 'Consumo del plan' });
    const method = screen.getByRole('region', { name: 'Método de pago' });
    const details = screen.getByRole('region', { name: 'Datos de facturación' });

    expect(within(usage).getByRole('progressbar', { name: 'Almacenamiento' })).toBeTruthy();
    expect(within(usage).getByText('1 GB')).toBeTruthy();
    expect(within(usage).getByText('60 días')).toBeTruthy();
    expect(within(usage).getByText('Activa')).toBeTruthy();
    expect(within(method).getByText('visa')).toBeTruthy();
    expect(within(method).getByText('···· ···· ···· 4242')).toBeTruthy();
    expect(within(details).getByText('NIT 12345678')).toBeTruthy();
    expect(within(details).getByText('ana@ejemplo.com')).toBeTruthy();
  });

  it('CA-7: una factura sin PDF dice «PDF en preparación» y no tiene descarga', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...HISTORY,
        payments: [{ ...APPROVED, invoice: { ...APPROVED.invoice, downloadable: false } }],
      }),
    );

    renderPage();

    expect(await screen.findByText('PDF en preparación')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull();
  });

  it('vacío: Personal gratis y sin vencimiento, y «Aún no tienes facturas ni pagos registrados.»', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        subscription: { plan: PERSONAL, expiresAt: null },
        paymentMethod: null,
        billingDetails: null,
        payments: [],
      }),
    );

    renderPage();

    expect(await screen.findByText('Aún no tienes facturas ni pagos registrados.')).toBeTruthy();
    expect(within(plan()).getByText('Sin vencimiento')).toBeTruthy();
    expect(within(plan()).getAllByText('Gratis')).toHaveLength(2);
    expect(within(plan()).getByText('—')).toBeTruthy();
    expect(screen.getByText('Aún no has pagado con tarjeta.')).toBeTruthy();
    expect(screen.getByText('Se guardan con tu primer pago.')).toBeTruthy();
  });

  it('error: «Reintentar» vuelve a pedir el historial', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 500));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ subscription: null, paymentMethod: null, billingDetails: null, payments: [] }),
    );

    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Aún no tienes facturas ni pagos registrados.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('CA-8: el botón de descarga pide el enlace firmado y lo abre', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ downloadUrl: 'https://minio.local/factura.pdf', expiresInSeconds: 300 }),
    );

    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Descargar factura NB-2026-0042' }));

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API}/billing/invoices/${INVOICE_ID}/download`);
    expect(openUrl).toHaveBeenCalledWith('https://minio.local/factura.pdf');
  });

  it('CA-8: si la factura ya no está (404), muestra el mensaje del catálogo y no abre nada', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_INVOICE_NOT_FOUND', 404));

    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: /Descargar factura/ }));

    expect(await screen.findByText(/No encontramos esa factura/)).toBeTruthy();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
