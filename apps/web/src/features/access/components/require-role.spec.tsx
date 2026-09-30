/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import { forgetSession, rememberSession } from '../../identity/session/session-memory';
import { SessionProvider } from '../../identity/session/session-provider';
import { sessionFixture } from '../../identity/session/test-session';

import { RequireRole } from './require-role';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const CLIENT_ROUTE: readonly RoleName[] = ['CLIENT'];
const INTERNAL_ROUTE: readonly RoleName[] = ['ADMIN', 'SUPPORT', 'OPERATOR'];

function renderRoute(allowed: readonly RoleName[]): void {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <RequireRole allowed={allowed}>
        <p>Contenido de la ruta</p>
      </RequireRole>
    </SessionProvider>,
  );
}

describe('RequireRole', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  it('CA-17: un cliente en una ruta de cliente ve los hijos', () => {
    rememberSession(sessionFixture({ role: 'CLIENT' }));

    renderRoute(CLIENT_ROUTE);

    expect(screen.getByText('Contenido de la ruta')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('CA-17: una cuenta interna en una ruta de cliente va a /interno sin ver los hijos', () => {
    rememberSession(sessionFixture({ role: 'SUPPORT' }));

    renderRoute(CLIENT_ROUTE);

    expect(replace).toHaveBeenCalledWith('/interno');
    expect(screen.queryByText('Contenido de la ruta')).toBeNull();
  });

  it('CA-17: un cliente en /interno va a /archivos sin ver los hijos', () => {
    rememberSession(sessionFixture({ role: 'CLIENT' }));

    renderRoute(INTERNAL_ROUTE);

    expect(replace).toHaveBeenCalledWith('/archivos');
    expect(screen.queryByText('Contenido de la ruta')).toBeNull();
  });

  it('CA-5: sin sesión no decide ni muestra los hijos (lo hace SessionGate)', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));

    renderRoute(CLIENT_ROUTE);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText('Contenido de la ruta')).toBeNull();
  });
});
