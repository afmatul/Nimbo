/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';

import { accountItem, accountsPage } from '../../../../../features/backoffice/test-accounts';
import {
  forgetSession,
  rememberSession,
} from '../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../lib/test-http';

import AdminCuentasPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';

describe('Cuentas del Administrador (/admin/cuentas)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse(accountsPage([accountItem()]))));
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-1, CA-17: pide la primera página a GET /backoffice/accounts dentro del marco interno', async () => {
    rememberSession(sessionFixture({ role: 'ADMIN' }));
    render(<SessionProvider apiPublicUrl={API}>{AdminCuentasPage()}</SessionProvider>);
    await act(async () => undefined);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Cuentas' })).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Laura Barrios' })).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/backoffice/accounts?page=1`);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Cuentas' })).toBeTruthy();
  });
});
