/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import { forgetSession, rememberSession } from '../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../features/identity/session/test-session';

import InternoGroupLayout from './layout';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function renderGroup(role: RoleName): void {
  rememberSession(sessionFixture({ role }));
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternoGroupLayout>
        <p>Contenido interno</p>
      </InternoGroupLayout>
    </SessionProvider>,
  );
}

describe('grupo (interno)', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    forgetSession();
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)('CA-17: %s entra al área interna', (role) => {
    renderGroup(role);

    expect(screen.getByText('Contenido interno')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('CA-17: un cliente que abre el área interna vuelve a /archivos sin verla', () => {
    renderGroup('CLIENT');

    expect(replace).toHaveBeenCalledWith('/archivos');
    expect(screen.queryByText('Contenido interno')).toBeNull();
  });
});
