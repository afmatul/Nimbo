/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';

import { metricsResponse } from '../../../../../features/backoffice/test-metrics';
import {
  forgetSession,
  rememberSession,
} from '../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../lib/test-http';

import AdminMetricasPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';

describe('Métricas del Administrador (/admin/metricas)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse(metricsResponse())));
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-12, CA-17: pide GET /backoffice/metrics dentro del marco del Administrador', async () => {
    rememberSession(sessionFixture({ role: 'ADMIN' }));
    render(<SessionProvider apiPublicUrl={API}>{AdminMetricasPage()}</SessionProvider>);
    await act(async () => undefined);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Métricas' })).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/backoffice/metrics`);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Cuentas', 'Catálogo de planes', 'Métricas']);
  });
});
