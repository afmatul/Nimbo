/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';

import { forgetSession, rememberSession } from '../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../features/identity/session/test-session';

import ClienteGroupLayout from './layout';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

async function renderGroup(role: RoleName): Promise<void> {
  rememberSession(sessionFixture({ role }));
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <ClienteGroupLayout>
        <p>Contenido de cliente</p>
      </ClienteGroupLayout>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

describe('grupo (cliente)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    replace.mockReset();
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    forgetSession();
  });

  it('CA-17: el cliente entra a sus rutas', async () => {
    await renderGroup('CLIENT');

    expect(screen.getByText('Contenido de cliente')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('CA-21 (005): envuelve las páginas del cliente con el proveedor de cargas, sin panel mientras no hay cargas', async () => {
    await renderGroup('CLIENT');

    expect(screen.getByText('Contenido de cliente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /panel de cargas/ })).toBeNull();
  });

  it('007 D-15: monta el resumen de espacio compartido, que se pide una vez a GET /storage/summary', async () => {
    await renderGroup('CLIENT');

    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith('/storage/summary'))).toHaveLength(1);
  });

  it('CA-17: un rol interno no llega a pedir el resumen de espacio', async () => {
    await renderGroup('ADMIN');

    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith('/storage/summary'))).toBe(false);
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)(
    'CA-17: %s que abre una ruta de cliente vuelve a /interno sin verla',
    async (role) => {
      await renderGroup(role);

      expect(replace).toHaveBeenCalledWith('/interno');
      expect(screen.queryByText('Contenido de cliente')).toBeNull();
    },
  );
});
