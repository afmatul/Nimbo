/**
 * @jest-environment jsdom
 */
import type { BillingHistoryResponse, SubscriptionView } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RenewalPage } from '../../../../../features/billing/components/renewal-payment';
import { createAuthFetch } from '../../../../../features/identity/session/auth-fetch';
import { errorResponse, jsonResponse } from '../../../../../lib/test-http';

const API = 'http://localhost/api/v1';
const EXPIRES = '2026-10-19T18:00:00.000Z';
const TEAM = {
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
const PRO = {
  ...TEAM,
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  priceCents: 4500,
};
const RENEWAL = {
  available: true,
  unavailableReason: null,
  expectedExpiresAt: EXPIRES,
  periodStartsAt: EXPIRES,
  periodEndsAt: '2026-11-18T18:00:00.000Z',
  plan: TEAM,
};
const VIEW: SubscriptionView = {
  plan: TEAM,
  expiresAt: EXPIRES,
  status: 'expiring',
  autoRenew: true,
  pendingPlan: null,
  pendingPlanDiscarded: false,
  nextCharge: null,
  renewal: RENEWAL,
};
const historyWith = (subscription: SubscriptionView | null): BillingHistoryResponse => ({
  subscription,
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: null,
  payments: [],
});
const RECEIPT = {
  reference: 'SIM-2026-000152',
  plan: { slug: 'equipo', name: 'Equipo' },
  expiresAt: '2026-11-18T18:00:00.000Z',
  amounts: { subtotalCents: 9821, vatCents: 1179, totalCents: 11_000 },
  receiptEmail: 'lucia@ejemplo.com',
};

const seriousViolations = (results: Awaited<ReturnType<typeof axe>>): unknown[] =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

describe('Pago de la renovación, /suscripcion/renovar (spec 010 CA-8 a CA-11, CA-26, CA-28)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const renderWith = async (history: BillingHistoryResponse) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(history));
    const view = render(<RenewalPage apiPublicUrl={API} authFetch={authFetch} />);
    await screen.findByRole('heading', { level: 1 });
    return view;
  };
  const fill = async (number: string) => {
    await userEvent.type(screen.getByLabelText('Número de tarjeta'), number);
    await userEvent.type(screen.getByLabelText('Vencimiento'), '12/28');
    await userEvent.type(screen.getByLabelText('CVC'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Pagar Q110.00' }));
  };

  it('CA-8, B-2: el resumen muestra el periodo nuevo y la ayuda nombra las tres tarjetas', async () => {
    const { container } = await renderWith(historyWith(VIEW));

    expect(screen.getByRole('heading', { name: /Renovar tu plan/, level: 1 })).toBeTruthy();
    expect(screen.getByText('del 19 de octubre de 2026 al 18 de noviembre de 2026')).toBeTruthy();
    expect(
      screen.getByText('Empieza cuando termina tu periodo actual: no pierdes días pagados.'),
    ).toBeTruthy();
    expect(
      screen.getByText(/4000 0000 0000 0341 aprueba ahora y se rechaza en el cobro automático\./),
    ).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-8: aprobado manda el `vence_en` que vio y muestra referencia y periodo', async () => {
    await renderWith(historyWith(VIEW));
    fetchMock.mockResolvedValueOnce(jsonResponse(RECEIPT));

    await fill('4242424242424242');

    expect(await screen.findByText('Pago aprobado')).toBeTruthy();
    expect(
      screen.getByText(
        'Renovaste tu plan Equipo hasta el 18 de noviembre de 2026. Te enviamos el comprobante a lucia@ejemplo.com.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Plan y facturación' }).getAttribute('href')).toBe(
      '/suscripcion',
    );
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(`${API}/billing/renew`);
    expect(JSON.parse(String(init?.body))).toMatchObject({ expectedExpiresAt: EXPIRES, nit: 'CF' });
  });

  it('CA-10: el aprobado toma el periodo del recibo, no el que se leyó al abrir la página', async () => {
    await renderWith(historyWith({ ...VIEW, status: 'readOnly' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...RECEIPT, expiresAt: '2026-11-25T18:00:00.000Z' }),
    );

    await fill('4242424242424242');

    expect(await screen.findByText('Pago aprobado')).toBeTruthy();
    expect(screen.getByText('del 26 de octubre de 2026 al 25 de noviembre de 2026')).toBeTruthy();
  });

  it('CA-9: rechazada, el aviso del catálogo y el formulario siguen', async () => {
    await renderWith(historyWith(VIEW));
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_PAYMENT_REJECTED', 402));

    await fill('4000000000000002');

    expect(
      await screen.findByText(/La tarjeta fue rechazada\. No se hizo ningún cargo\./),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pagar Q110.00' })).toBeTruthy();
  });

  it('CA-26: si otro pago ya renovó, el 409 muestra su mensaje', async () => {
    await renderWith(historyWith(VIEW));
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_ALREADY_RENEWED', 409));

    await fill('4242424242424242');

    expect(
      await screen.findByText(
        'Tu plan ya está renovado para el siguiente periodo. No se hizo ningún cargo.',
      ),
    ).toBeTruthy();
  });

  it('CA-10: desde solo lectura el periodo empieza hoy', async () => {
    await renderWith(historyWith({ ...VIEW, status: 'readOnly' }));

    expect(
      screen.getByText(
        'Empieza hoy, al aprobarse el pago, y tu cuenta deja de estar en solo lectura.',
      ),
    ).toBeTruthy();
  });

  it('CA-20: desde solo lectura con un cambio programado activo, el resumen cobra ese plan', async () => {
    await renderWith(
      historyWith({
        ...VIEW,
        status: 'readOnly',
        pendingPlan: PRO,
        renewal: { ...RENEWAL, plan: PRO },
      }),
    );

    expect(screen.getByRole('button', { name: 'Pagar Q45.00' })).toBeTruthy();
    expect(screen.getByText('Plan Pro')).toBeTruthy();
  });

  it('CA-29: con el cambio programado descartado, el resumen cobra el plan actual', async () => {
    await renderWith(
      historyWith({
        ...VIEW,
        status: 'readOnly',
        pendingPlan: PRO,
        pendingPlanDiscarded: true,
        renewal: RENEWAL,
      }),
    );

    expect(screen.getByRole('button', { name: 'Pagar Q110.00' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pagar Q45.00' })).toBeNull();
  });

  it.each([
    [
      'CA-28',
      { ...RENEWAL, available: false, unavailableReason: 'PLAN_CHANGE_PENDING' as const },
      /Tienes un cambio de plan programado/,
    ],
    [
      'CA-26',
      { ...RENEWAL, available: false, unavailableReason: 'ALREADY_RENEWED' as const },
      /Tu plan ya está renovado/,
    ],
  ])(
    '%s: si hoy no se puede renovar, lo dice y no muestra el formulario',
    async (_ca, renewal, text) => {
      await renderWith(historyWith({ ...VIEW, renewal }));

      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.queryByLabelText('Número de tarjeta')).toBeNull();
    },
  );

  it('CA-11: en Personal no hay qué renovar', async () => {
    await renderWith(
      historyWith({ ...VIEW, plan: { ...TEAM, priceCents: 0 }, expiresAt: null, renewal: null }),
    );

    expect(screen.getByText(/Tu cuenta usa el plan Personal/)).toBeTruthy();
  });
});
