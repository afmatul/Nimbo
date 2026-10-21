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

import { PlanChangePage } from './plan-change-page';

const API = 'http://localhost/api/v1';
const EXPIRES = '2026-11-04T18:00:00.000Z';
const plan = (id: string, slug: string, name: string, priceCents: number, extra = {}) => ({
  id,
  slug,
  name,
  description: `Plan ${name}`,
  priceCents,
  quotaBytes: '375809638400',
  maxFileBytes: '1073741824',
  maxEditors: 5,
  agentQueriesPerMonth: 2000,
  retainedVersions: 60,
  trashRetentionDays: 60,
  ...extra,
});
const PERSONAL = plan('10000000-0000-4000-8000-000000000001', 'personal', 'Personal', 0, {
  quotaBytes: '15000000000',
  maxEditors: 0,
  retainedVersions: 3,
});
const PRO = plan('10000000-0000-4000-8000-000000000002', 'pro', 'Pro', 4500, {
  retainedVersions: 30,
});
const TEAM = plan('10000000-0000-4000-8000-000000000003', 'equipo', 'Equipo', 11_000);
const INSTITUTIONAL = plan(
  '10000000-0000-4000-8000-000000000004',
  'institucional',
  'Institucional',
  45_000,
  {
    retainedVersions: 100,
  },
);
const PLANS = { plans: [PERSONAL, PRO, TEAM, INSTITUTIONAL] };
const VIEW: SubscriptionView = {
  plan: TEAM,
  expiresAt: EXPIRES,
  status: 'active',
  autoRenew: true,
  pendingPlan: null,
  pendingPlanDiscarded: false,
  nextCharge: null,
  renewal: null,
};
const historyWith = (subscription: SubscriptionView | null): BillingHistoryResponse => ({
  subscription,
  paymentMethod: { brand: 'visa', last4: '4242' },
  billingDetails: null,
  payments: [],
});

const seriousViolations = (results: Awaited<ReturnType<typeof axe>>): unknown[] =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

describe('Cambiar de plan, /suscripcion/cambiar-plan (spec 010 CA-16 a CA-18, CA-21, CA-27)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });
  const onScheduled = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onScheduled.mockReset();
    global.fetch = fetchMock;
  });

  /** El historial y el catálogo llegan a la vez; se responde según la URL. */
  const renderWith = async (history: BillingHistoryResponse) => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(jsonResponse(String(url).endsWith('/billing/plans') ? PLANS : history)),
    );
    const view = render(
      <PlanChangePage
        apiPublicUrl={API}
        authFetch={authFetch}
        space={{ status: 'ready', summary: spaceSummaryWith(64.2 * GB) }}
        onScheduled={onScheduled}
      />,
    );
    await screen.findByRole('heading', { name: 'Equipo', level: 2 });
    return view;
  };
  const cardOf = (name: string) =>
    screen.getByRole('heading', { name, level: 2 }).closest('div.flex.flex-col') as HTMLElement;

  it('CA-16, PD-86: los planes activos con el actual marcado y la fecha en que se aplica el cambio', async () => {
    const { container } = await renderWith(historyWith(VIEW));

    expect(
      screen.getByText(
        /El cambio se aplica el 4 de noviembre de 2026, cuando termina tu periodo\./,
      ),
    ).toBeTruthy();
    expect(within(cardOf('Equipo')).getByText('Plan actual')).toBeTruthy();
    expect(within(cardOf('Equipo')).getByText('Es tu plan actual')).toBeTruthy();
    expect(within(cardOf('Pro')).getByRole('button', { name: 'Cambiar a Pro' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Comparación de planes' })).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);
  });

  it('CA-16, CA-21: confirmar Pro muestra el cobro con la tarjeta y el aviso de versiones; programa y vuelve', async () => {
    const { container } = await renderWith(historyWith(VIEW));

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a Pro' }));
    const dialog = screen.getByRole('alertdialog', {
      name: '¿Cambiar a Pro el 4 de noviembre de 2026?',
    });
    expect(within(dialog).getByText('Q45.00 con VISA ···· 4242')).toBeTruthy();
    expect(within(dialog).getByText('Pro guarda menos versiones que tu plan actual.')).toBeTruthy();
    expect(seriousViolations(await axe(container))).toEqual([]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...VIEW, pendingPlan: PRO }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar cambio a Pro' }));

    expect(onScheduled).toHaveBeenCalledTimes(1);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[0]).toBe(`${API}/billing/subscription/plan-change`);
    expect(put?.[1]?.body).toBe(JSON.stringify({ planSlug: 'pro' }));
  });

  it('CA-16: subir a Institucional no avisa nada (no baja ningún límite)', async () => {
    await renderWith(historyWith(VIEW));

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a Institucional' }));

    expect(screen.queryByText(/menos/)).toBeNull();
  });

  it('CA-21: bajar a Personal avisa versiones, espacio y edición, sin cobro', async () => {
    await renderWith(historyWith(VIEW));

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a Personal' }));
    const dialog = screen.getByRole('alertdialog', {
      name: '¿Cambiar a Personal el 4 de noviembre de 2026?',
    });

    expect(within(dialog).getByText('Personal incluye menos que tu plan actual.')).toBeTruthy();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    expect(within(dialog).getByText('Ninguno')).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Programar cambio a Personal' }),
    ).toBeTruthy();
  });

  it('CA-27: en solo lectura, Personal se aplica ya y sin cobro', async () => {
    await renderWith(historyWith({ ...VIEW, status: 'readOnly' }));

    expect(screen.getByText('Tu suscripción venció.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a Personal' }));

    const dialog = screen.getByRole('alertdialog', { name: '¿Cambiar a Personal ahora?' });
    expect(within(dialog).getByText('Personal · desde hoy')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cambiar a Personal ahora' })).toBeTruthy();
  });

  it('CA-17: si el plan ya no está, el diálogo dice qué pasó y solo ofrece «Cerrar»', async () => {
    await renderWith(historyWith(VIEW));
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a Pro' }));
    fetchMock.mockResolvedValueOnce(errorResponse('BILLING_PLAN_CHANGE_INVALID', 400));

    await userEvent.click(screen.getByRole('button', { name: 'Programar cambio a Pro' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText('No pudimos programar el cambio.')).toBeTruthy();
    expect(
      within(dialog).getByText(
        'Ese plan ya no está disponible. Cierra este aviso y elige otro plan de la lista.',
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Programar/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onScheduled).not.toHaveBeenCalled();
  });

  it('CA-18: desde Personal, los planes de pago llevan a contratar', async () => {
    await renderWith(historyWith({ ...VIEW, plan: PERSONAL, expiresAt: null }));

    expect(
      screen.getByText('Tu cuenta usa Personal. Elige un plan de pago para contratarlo.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contratar Pro' }).getAttribute('href')).toBe(
      '/planes/contratar?slug=pro',
    );
    expect(screen.queryByRole('button', { name: /Cambiar a/ })).toBeNull();
  });

  it('error al cargar: aviso con «Reintentar» y el plan sin cambios', async () => {
    fetchMock.mockResolvedValue(errorResponse('ALGO_INESPERADO', 500));
    render(
      <PlanChangePage
        apiPublicUrl={API}
        authFetch={authFetch}
        space={{ status: 'loading' }}
        onScheduled={onScheduled}
      />,
    );

    expect(await screen.findByText('No pudimos cargar los planes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
