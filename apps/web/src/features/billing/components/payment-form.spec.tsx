/**
 * @jest-environment jsdom
 */
import type { Plan } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
import { createAuthFetch } from '../../identity/session/auth-fetch';

import { PaymentForm } from './payment-form';

const API = 'http://localhost/api/v1';
const TEAM: Plan = {
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  description: 'Para equipos',
  priceCents: 11_000,
  quotaBytes: '350000000000',
  maxFileBytes: '1000000000',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 60,
  trashRetentionDays: 60,
};
const APPROVED = {
  reference: 'SIM-2026-000007',
  plan: { slug: 'equipo', name: 'Equipo' },
  expiresAt: '2026-11-13T12:00:00.000Z',
  amounts: { subtotalCents: 9821, vatCents: 1179, totalCents: 11_000 },
  receiptEmail: 'lucia@ejemplo.com',
};

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

describe('PaymentForm (spec 009 §6: formulario, procesando, rechazado, aprobado, error)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const renderForm = (): ReturnType<typeof render> =>
    render(<PaymentForm plan={TEAM} apiPublicUrl={API} authFetch={authFetch} />);

  async function pay(number = '4242 4242 4242 4242', expiry = '12/30'): Promise<void> {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Número de tarjeta'), number);
    await user.type(screen.getByLabelText('Vencimiento'), expiry);
    await user.type(screen.getByLabelText('CVC'), '123');
    await user.click(screen.getByRole('button', { name: 'Pagar Q110.00' }));
  }

  it('formulario: marca el pago como simulado, ofrece las tarjetas de prueba y muestra el resumen con IVA', async () => {
    const { container } = renderForm();

    expect(screen.getByText('Simulado')).toBeTruthy();
    expect(screen.getByText(/4242 4242 4242 4242 aprueba/)).toBeTruthy();
    expect(screen.getByText('Q98.21')).toBeTruthy();
    expect(screen.getByText('Q11.79')).toBeTruthy();
    expect(screen.getAllByText('Q110.00').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('NIT para la factura') as HTMLInputElement).value).toBe('CF');
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('mockup: agrupa el número, muestra VISA, oculta el CVC, explica el vencimiento y dice «mensual»', async () => {
    const { container } = renderForm();
    const user = userEvent.setup();
    const number = screen.getByLabelText('Número de tarjeta') as HTMLInputElement;
    const expiry = screen.getByLabelText('Vencimiento');

    await user.type(number, '4242424242424242');

    expect(number.value).toBe('4242 4242 4242 4242');
    expect(screen.getByText('VISA')).toBeTruthy();
    expect((screen.getByLabelText('CVC') as HTMLInputElement).type).toBe('password');
    expect(expiry.getAttribute('placeholder')).toBe('MM/AA');
    expect(screen.getByText('Mes y año, como 12/28.').id).toBe(
      expiry.getAttribute('aria-describedby'),
    );
    expect(screen.getByText('mensual')).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('mockup: sin número no hay marca; un vencimiento inválido conserva la ayuda y suma el error', async () => {
    renderForm();

    expect(screen.queryByText('VISA')).toBeNull();
    await pay('4242 4242 4242 4242', '13/2');

    const expiry = screen.getByLabelText('Vencimiento');
    expect(expiry.getAttribute('aria-describedby')).toBe('pago-expiry-ayuda pago-expiry-error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formulario: un dato inválido se marca en su campo y no llama a la API', async () => {
    renderForm();

    await pay('5555 5555 5555 4444');

    expect(screen.getByText(/Usa una tarjeta de prueba/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('procesando: mientras la API responde, el botón queda ocupado con indicador de progreso (RNF-14)', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    renderForm();

    await pay();

    const button = screen.getByRole('button', { name: /Procesando pago/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('rechazado: el 402 muestra el mensaje de la tarjeta rechazada y deja el formulario para otra tarjeta', async () => {
    fetchMock.mockResolvedValue(errorResponse('BILLING_PAYMENT_REJECTED', 402));
    renderForm();

    await pay('4000 0000 0000 0002');

    expect(
      await screen.findByText(
        'La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pagar Q110.00' })).toBeTruthy();
  });

  it('rechazado: una tarjeta vencida que detecta la API se marca bajo el vencimiento', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'BILLING_INVALID_INPUT',
          message: 'x',
          correlationId: 'corr-1',
          fields: [{ field: 'card.expMonth', reason: 'CARD_EXPIRED', message: 'x' }],
        },
        422,
      ),
    );
    renderForm();

    await pay('4242 4242 4242 4242', '01/20');

    expect(
      await screen.findByText(
        'La tarjeta está vencida. Usa una tarjeta con fecha de vencimiento vigente.',
      ),
    ).toBeTruthy();
  });

  it('aprobado: muestra «Pago aprobado», la referencia, el plan activo, su vencimiento y el correo del comprobante', async () => {
    fetchMock.mockResolvedValue(jsonResponse(APPROVED, 201));
    renderForm();

    await pay();

    expect(await screen.findByRole('heading', { name: 'Pago aprobado' })).toBeTruthy();
    expect(screen.getByText('SIM-2026-000007')).toBeTruthy();
    expect(
      screen.getByText(
        'Tu plan Equipo ya está activo. Te enviamos el comprobante a lucia@ejemplo.com.',
      ),
    ).toBeTruthy();
    const [request] = fetchMock.mock.calls;
    expect(String(request?.[0])).toBe(`${API}/billing/subscribe`);
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      planSlug: 'equipo',
      card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123' },
      nit: 'CF',
    });
  });

  it('010 B-2: la tarjeta 0341 se acepta al contratar (aprueba con el cliente presente)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(APPROVED, 201));
    renderForm();

    await pay('4000 0000 0000 0341');

    expect(await screen.findByRole('heading', { name: 'Pago aprobado' })).toBeTruthy();
    const [request] = fetchMock.mock.calls;
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      card: { number: '4000000000000341' },
    });
  });

  it('error: un fallo inesperado muestra el mensaje del catálogo con el código para soporte', async () => {
    fetchMock.mockResolvedValue(errorResponse('ALGO_INESPERADO', 500));
    renderForm();

    await pay();

    expect((await screen.findByRole('alert')).textContent).toContain('corr-prueba');
  });
});
