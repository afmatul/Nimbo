/**
 * @jest-environment jsdom
 */
import type { BillingHistoryResponse } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { InvoiceHistory } from '../../../../features/billing/components/invoice-history';
import { createAuthFetch } from '../../../../features/identity/session/auth-fetch';
import { errorResponse, jsonResponse } from '../../../../lib/test-http';

const API = 'http://localhost/api/v1';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const HISTORY: BillingHistoryResponse = {
  subscription: { planName: 'Equipo', expiresAt: '2026-11-13T18:00:00.000Z' },
  payments: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-10-14T18:00:00.000Z',
      reference: 'SIM-2026-000008',
      planName: 'Equipo',
      amountCents: 11_000,
      status: 'aprobada',
      invoice: { id: INVOICE_ID, number: 'NB-2026-0042', downloadable: true },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-10-14T17:00:00.000Z',
      reference: 'SIM-2026-000007',
      planName: 'Equipo',
      amountCents: 11_000,
      status: 'rechazada',
      invoice: null,
    },
  ],
};

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

describe('/suscripcion (spec 009 CA-7, CA-8, §6: cargando, con facturas, vacío, error)', () => {
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
    render(<InvoiceHistory apiPublicUrl={API} authFetch={authFetch} openUrl={openUrl} />);

  it('cargando: muestra el estado de carga mientras llega el historial', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByText('Cargando tu historial…')).toBeTruthy();
  });

  it('CA-7, con facturas: plan actual y una fila por pago con referencia, factura, monto y estado', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));

    const { container } = renderPage();

    expect(await screen.findByText('Activo hasta el 13 nov 2026.')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0] as HTMLElement).getByText('NB-2026-0042')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('Q110.00')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('Aprobado')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Rechazado')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).queryByRole('button')).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/billing/history`);
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-7: una factura sin PDF se muestra sin botón de descarga', async () => {
    const first = HISTORY.payments[0];
    if (first?.invoice == null) throw new Error('sin factura');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...HISTORY,
        payments: [{ ...first, invoice: { ...first.invoice, downloadable: false } }],
      }),
    );

    renderPage();

    expect(await screen.findByText('PDF en preparación')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull();
  });

  it('vacío: «Aún no tienes facturas ni pagos registrados.» y el plan Personal sin vencimiento', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ subscription: { planName: 'Personal', expiresAt: null }, payments: [] }),
    );

    renderPage();

    expect(await screen.findByText('Aún no tienes facturas ni pagos registrados.')).toBeTruthy();
    expect(screen.getByText('Sin vencimiento.')).toBeTruthy();
  });

  it('error: «Reintentar» vuelve a pedir el historial', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscription: null, payments: [] }));

    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Aún no tienes facturas ni pagos registrados.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('CA-8: «Descargar» pide el enlace firmado y lo abre', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ downloadUrl: 'https://minio.local/factura.pdf', expiresInSeconds: 300 }),
    );

    renderPage();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /Descargar factura NB-2026-0042/ }));

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API}/billing/invoices/${INVOICE_ID}/download`);
    expect(openUrl).toHaveBeenCalledWith('https://minio.local/factura.pdf');
  });

  it('CA-8: si la factura ya no está (404), muestra el mensaje del catálogo y no abre nada', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(HISTORY));
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_INVOICE_NOT_FOUND', 404));

    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: /Descargar/ }));

    expect(await screen.findByText(/No encontramos esa factura/)).toBeTruthy();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
