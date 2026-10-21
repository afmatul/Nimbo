/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';

import { accountItem } from '../../../../../../features/backoffice/test-accounts';
import {
  forgetSession,
  rememberSession,
} from '../../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../../lib/test-http';

import AdminCuentaPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';
const ID = accountItem().id;

describe('Ficha de una cuenta (/admin/cuentas/[id])', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse(accountItem())));
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-1, CA-17: pide la cuenta del id de la ruta a GET /backoffice/accounts/:id', async () => {
    rememberSession(sessionFixture({ role: 'ADMIN' }));
    const page = await AdminCuentaPage({ params: Promise.resolve({ id: ID }) });
    render(<SessionProvider apiPublicUrl={API}>{page}</SessionProvider>);
    await act(async () => undefined);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Laura Barrios' })).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/backoffice/accounts/${ID}`);
  });
});
