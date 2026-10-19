/**
 * @jest-environment jsdom
 */
import type { BillingHistoryResponse, SubscriptionView } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
import { createAuthFetch } from '../../identity/session/auth-fetch';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';

import { PlanAndBilling } from './plan-and-billing';

const API = 'http://localhost/api/v1';
const EXPIRES = '2026-11-04T18:00:00.000Z';
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
const PRO = {
  ...TEAM,
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  priceCents: 4500,
};
const PERSONAL = {
  ...TEAM,
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  priceCents: 0,
  quotaBytes: '15000000000',
};
const CARD = { brand: 'visa', last4: '4242' };
const NEXT_CHARGE = { date: EXPIRES, amountCents: 11_000, planName: 'Equipo', card: CARD };
const RENEWAL = {
  available: true,
  unavailableReason: null,
  expectedExpiresAt: EXPIRES,
  periodStartsAt: EXPIRES,
  periodEndsAt: '2026-12-04T18:00:00.000Z',
  amountCents: 11_000,
  planName: 'Equipo',
};
const VIGENTE: SubscriptionView = {
  plan: TEAM,
  expiresAt: EXPIRES,
  status: 'active',
  autoRenew: true,
  pendingPlan: null,
  nextCharge: NEXT_CHARGE,
  renewal: RENEWAL,
};
const REJECTED_PAYMENT = {
  id: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-11-04T18:00:00.000Z',
  reference: 'SIM-2026-000009',
  planName: 'Equipo',
  amountCents: 11_000,
  status: 'rechazada' as const,
  invoice: null,
};
const historyWith = (
  subscription: SubscriptionView | null,
  payments: BillingHistoryResponse['payments'] = [],
): BillingHistoryResponse => ({
  subscription,
  paymentMethod: CARD,
  billingDetails: { nit: '45279136', receiptEmail: 'lucia@ejemplo.com' },
  payments,
});
const pendingRenewal = {
  ...RENEWAL,
  available: false,
  unavailableReason: 'PLAN_CHANGE_PENDING' as const,
};

const seriousViolations = (results: Awaited<ReturnType<typeof axe>>): unknown[] =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

describe('Plan y facturación en la 010 (spec 010 §6, CA-6, CA-16, CA-19, CA-25, CA-28)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const renderWith = async (history: BillingHistoryResponse, usedBytes = 64.2 * GB) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(history));
    const view = render(
      <PlanAndBilling
        apiPublicUrl={API}
        authFetch={authFetch}
        space={{ status: 'ready', summary: spaceSummaryWith(usedBytes) }}
      />,
    );
    await screen.findByRole('heading', { name: /Nimbo/ });
    return view;
  };
  const nextCharge = () => screen.getByRole('region', { name: 'Próximo cobro' });
  const autoRenew = () => screen.getByRole('switch', { name: 'Renovación automática' });

  it('vigente, CA-25: «Próximo cobro» con fecha, monto, plan y tarjeta; interruptor activado y «Renovar ahora»', async () => {
    const { container } = await renderWith(historyWith(VIGENTE));

    expect(within(nextCharge()).getByText('Q110.00 · plan Equipo')).toBeTruthy();
    expect(within(nextCharge()).getByText('···· 4242')).toBeTruthy();
    expect(autoRenew().getAttribute('aria-checked')).toBe('true');
    expect(within(nextCharge()).getByText('Activada')).toBeTruthy();
    expect(
      within(nextCharge()).getByRole('link', { name: 'Renovar ahora' }).getAttribute('href'),
    ).toBe('/suscripcion/renovar');
    expect(screen.queryByText(/Se renovará con/)).toBeNull();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('por vencer, §6: «Tu plan Equipo vence el … Se renovará con Visa ···· 4242.»', async () => {
    const { container } = await renderWith(historyWith({ ...VIGENTE, status: 'expiring' }));

    expect(
      screen.getByText(
        'Tu plan Equipo vence el 4 de noviembre de 2026. Se renovará con Visa ···· 4242.',
      ),
    ).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('renovación desactivada, §6: aviso con «Renovar ahora» y sin cobro automático', async () => {
    const { container } = await renderWith(
      historyWith({ ...VIGENTE, autoRenew: false, nextCharge: null }),
    );

    expect(
      screen.getByText(
        'Tu plan vence el 4 de noviembre de 2026 y no se renovará. Renueva ahora para no quedar en solo lectura.',
      ),
    ).toBeTruthy();
    expect(
      within(nextCharge()).getByText(
        'No habrá cobro automático. Tu plan vence el 4 de noviembre de 2026.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Renovar ahora' })).toHaveLength(1);
    expect(autoRenew().getAttribute('aria-checked')).toBe('false');
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('N-4, CA-28: apagada y con un cambio a Pro, pide cancelar el cambio y no ofrece «Renovar ahora»', async () => {
    await renderWith(
      historyWith({
        ...VIGENTE,
        autoRenew: false,
        pendingPlan: PRO,
        nextCharge: null,
        renewal: pendingRenewal,
      }),
    );

    expect(
      screen.getByText(
        'Tu plan vence el 4 de noviembre de 2026 y no se renovará. Para renovar ahora, primero cancela el cambio a Pro.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Renovar ahora' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar cambio' })).toBeTruthy();
  });

  it('cambio programado, CA-16, CA-28: aviso con el plan nuevo, cobro de Pro y sin «Renovar ahora»', async () => {
    const { container } = await renderWith(
      historyWith({
        ...VIGENTE,
        pendingPlan: PRO,
        nextCharge: { ...NEXT_CHARGE, amountCents: 4500, planName: 'Pro' },
        renewal: pendingRenewal,
      }),
    );

    expect(screen.getByText('Tu plan cambiará a Pro el 4 de noviembre de 2026.')).toBeTruthy();
    expect(screen.getByText('Hasta entonces conservas Equipo y sus límites.')).toBeTruthy();
    expect(within(nextCharge()).getByText('Q45.00 · plan Pro')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Renovar ahora' })).toBeNull();
    expect(
      within(nextCharge()).getByText(
        /no puedes renovar por adelantado\. Si quieres renovar ahora, primero cancela el cambio/,
      ),
    ).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-19: «Cancelar cambio» manda el DELETE y muestra la vista nueva sin el aviso', async () => {
    await renderWith(historyWith({ ...VIGENTE, pendingPlan: PRO, renewal: pendingRenewal }));
    fetchMock.mockResolvedValueOnce(jsonResponse(VIGENTE));

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar cambio' }));

    expect(await screen.findByRole('link', { name: 'Renovar ahora' })).toBeTruthy();
    expect(screen.queryByText(/Tu plan cambiará a Pro/)).toBeNull();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API}/billing/subscription/plan-change`);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
  });

  it('cambio a Personal, CA-21: sin cobro, aviso de cuota y sin interruptor', async () => {
    const { container } = await renderWith(
      historyWith({ ...VIGENTE, pendingPlan: PERSONAL, nextCharge: null, renewal: pendingRenewal }),
    );

    expect(screen.getByText('Tu plan cambiará a Personal el 4 de noviembre de 2026.')).toBeTruthy();
    expect(
      screen.getByText(/no perderás archivos, pero no podrás subir hasta liberar espacio\./),
    ).toBeTruthy();
    expect(
      within(nextCharge()).getByText(
        'Sin cobro: el 4 de noviembre de 2026 pasas a Personal, que es gratis.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('vencida, CA-14: aviso de solo lectura con «Renovar plan», «Vencida», «Venció el» y el cobro rechazado', async () => {
    const { container } = await renderWith(
      historyWith(
        {
          ...VIGENTE,
          status: 'readOnly',
          nextCharge: null,
          renewal: { ...RENEWAL, periodStartsAt: '2026-11-05T18:00:00.000Z' },
        },
        [REJECTED_PAYMENT],
      ),
    );

    expect(screen.getByText('Tu suscripción venció.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Renovar plan' }).getAttribute('href')).toBe(
      '/suscripcion/renovar',
    );
    const plan = screen.getByRole('region', { name: /Nimbo Equipo/ });
    expect(within(plan).getByText('Vencida')).toBeTruthy();
    expect(within(plan).getByText('Venció el')).toBeTruthy();
    expect(
      within(nextCharge()).getByText(
        'Sin cobro programado. Tu suscripción venció el 4 de noviembre de 2026 y el cobro automático con VISA ···· 4242 fue rechazado.',
      ),
    ).toBeTruthy();
    expect((autoRenew() as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(nextCharge()).getByText('Podrás activarla cuando renueves tu plan.'),
    ).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-6: apagar pide confirmación con la consecuencia y manda el PUT; encender no pregunta', async () => {
    await renderWith(historyWith(VIGENTE));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...VIGENTE, autoRenew: false, nextCharge: null }),
    );

    await userEvent.click(autoRenew());
    const dialog = screen.getByRole('alertdialog', {
      name: '¿Desactivar la renovación automática?',
    });
    expect(within(dialog).getByText(/tu cuenta quedará en solo lectura/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar renovación' }));

    expect(await within(nextCharge()).findByText('Desactivada')).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(VIGENTE));
    await userEvent.click(autoRenew());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await within(nextCharge()).findByText('Activada')).toBeTruthy();
  });

  it('error al apagar: el aviso dice que nada cambió y «Reintentar» repite el pedido', async () => {
    await renderWith(historyWith(VIGENTE));
    fetchMock.mockResolvedValueOnce(errorResponse('SHARED_SERVICE_UNAVAILABLE', 503));

    await userEvent.click(autoRenew());
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar renovación' }));

    expect(await screen.findByText('No pudimos desactivar la renovación automática.')).toBeTruthy();
    expect(screen.getByText(/Tu renovación sigue activada y tu plan no cambió\./)).toBeTruthy();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...VIGENTE, autoRenew: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await within(nextCharge()).findByText('Desactivada')).toBeTruthy();
  });

  it('Personal: sin «Próximo cobro» ni avisos; «Ver planes» lleva a contratar', async () => {
    await renderWith(
      historyWith({ ...VIGENTE, plan: PERSONAL, expiresAt: null, nextCharge: null, renewal: null }),
    );

    expect(screen.queryByRole('region', { name: 'Próximo cobro' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver planes' }).getAttribute('href')).toBe('/planes');
  });
});
