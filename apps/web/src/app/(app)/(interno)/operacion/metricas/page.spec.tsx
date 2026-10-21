/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HeaderAccountProvider } from '../../../../../components/nimbo/header-account';
import { metricsResponse } from '../../../../../features/backoffice/test-metrics';
import { SessionAccountMenu } from '../../../../../features/identity/components/session-account-menu';
import {
  forgetSession,
  rememberSession,
} from '../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../lib/test-http';

import OperacionMetricasPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';

/** La página como la arma `(app)/layout`: el menú de la cuenta en la cabecera del marco. */
async function renderPage(): Promise<void> {
  rememberSession(sessionFixture({ role: 'OPERATOR' }));
  render(
    <SessionProvider apiPublicUrl={API}>
      <HeaderAccountProvider account={<SessionAccountMenu />}>
        {OperacionMetricasPage()}
      </HeaderAccountProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

describe('Métricas del Operador (/operacion/metricas)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse(metricsResponse())));
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-12, CA-17: pide GET /backoffice/metrics dentro de su marco, con Métricas como única entrada', async () => {
    await renderPage();

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Métricas' })).toBeTruthy();
    expect(within(main).getByRole('table', { name: /Cuentas por plan/ })).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/backoffice/metrics`);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Métricas']);
  });

  it('011 CA-17: el Operador llega desde el menú de la cuenta a Seguridad, Mi actividad y Cerrar sesión', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Ana López (menú de la cuenta)' }));

    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Seguridad', 'Mi actividad', 'Cerrar sesión']);
    expect(within(menu).getByRole('menuitem', { name: 'Mi actividad' }).getAttribute('href')).toBe(
      '/interno/actividad',
    );
  });
});
