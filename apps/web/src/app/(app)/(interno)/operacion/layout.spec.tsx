/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import {
  forgetSession,
  rememberSession,
} from '../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../features/identity/session/test-session';

import OperacionGroupLayout from './layout';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function renderGroup(role: RoleName): void {
  rememberSession(sessionFixture({ role }));
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <OperacionGroupLayout>
        <p>Contenido del Operador</p>
      </OperacionGroupLayout>
    </SessionProvider>,
  );
}

describe('grupo operacion', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    forgetSession();
  });

  it('011 CA-17: el Operador entra a su área', () => {
    renderGroup('OPERATOR');

    expect(screen.getByText('Contenido del Operador')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['SUPPORT', '/interno'],
    ['ADMIN', '/interno'],
    ['CLIENT', '/archivos'],
  ] as const)('011 CA-14: %s que abre el área del Operador vuelve a %s sin verla', (role, path) => {
    renderGroup(role);

    expect(replace).toHaveBeenCalledWith(path);
    expect(screen.queryByText('Contenido del Operador')).toBeNull();
  });
});
