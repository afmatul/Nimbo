/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';

import {
  forgetSession,
  rememberSession,
} from '../../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../../features/identity/session/test-session';

import AdminNuevaCuentaPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';

describe('Alta interna (/admin/cuentas/nueva)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-5, CA-17: el formulario de alta dentro del marco interno, sin pedir nada al abrir', async () => {
    rememberSession(sessionFixture({ role: 'ADMIN' }));
    render(<SessionProvider apiPublicUrl={API}>{AdminNuevaCuentaPage()}</SessionProvider>);
    await act(async () => undefined);

    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Nueva cuenta interna' }),
    ).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.includes('/backoffice/'))).toEqual([]);
  });
});
