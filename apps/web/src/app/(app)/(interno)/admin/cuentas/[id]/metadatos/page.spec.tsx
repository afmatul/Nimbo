/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';

import { accountItem } from '../../../../../../../features/backoffice/test-accounts';
import {
  clientFile,
  clientFilesPage,
  LAURA,
} from '../../../../../../../features/backoffice/test-client-files';
import {
  forgetSession,
  rememberSession,
} from '../../../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../../../lib/test-http';

import AdminCuentaMetadatosPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const API = 'http://localhost/api/v1';

function respond(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const url = String(input);
  if (url.startsWith(`${API}/backoffice/client-files`)) {
    return Promise.resolve(jsonResponse(clientFilesPage([clientFile()])));
  }
  return Promise.resolve(jsonResponse(accountItem()));
}

describe('Metadatos desde la ficha (/admin/cuentas/[id]/metadatos)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(respond);
  });

  afterEach(() => {
    forgetSession();
  });

  it('011 CA-13: la URL lleva el id; el correo sale de la ficha y solo viaja a la API', async () => {
    rememberSession(sessionFixture({ role: 'ADMIN' }));
    const page = await AdminCuentaMetadatosPage({ params: Promise.resolve({ id: LAURA.id }) });
    render(<SessionProvider apiPublicUrl={API}>{page}</SessionProvider>);
    await act(async () => undefined);

    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Metadatos de archivos' }),
    ).toBeTruthy();
    const urls = jest
      .mocked(global.fetch)
      .mock.calls.map(([url]) => String(url))
      .filter((url) => url.includes('/backoffice/'));
    expect(urls).toEqual([
      `${API}/backoffice/accounts/${LAURA.id}`,
      `${API}/backoffice/client-files?email=laura.barrios%40alpha.gt&page=1`,
    ]);
  });
});
