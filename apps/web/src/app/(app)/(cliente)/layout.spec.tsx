/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import { forgetSession, rememberSession } from '../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../features/identity/session/test-session';

import ClienteGroupLayout from './layout';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function renderGroup(role: RoleName): void {
  rememberSession(sessionFixture({ role }));
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <ClienteGroupLayout>
        <p>Contenido de cliente</p>
      </ClienteGroupLayout>
    </SessionProvider>,
  );
}

describe('grupo (cliente)', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    forgetSession();
  });

  it('CA-17: el cliente entra a sus rutas', () => {
    renderGroup('CLIENT');

    expect(screen.getByText('Contenido de cliente')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)(
    'CA-17: %s que abre una ruta de cliente vuelve a /interno sin verla',
    (role) => {
      renderGroup(role);

      expect(replace).toHaveBeenCalledWith('/interno');
      expect(screen.queryByText('Contenido de cliente')).toBeNull();
    },
  );
});
