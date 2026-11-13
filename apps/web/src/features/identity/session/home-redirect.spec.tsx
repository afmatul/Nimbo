/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';

import { errorResponse, jsonResponse } from '../../../lib/test-http';

import { HomeRedirect } from './home-redirect';
import { forgetSession } from './session-memory';
import { SessionProvider } from './session-provider';
import { sessionFixture } from './test-session';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function renderRoot(): void {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <HomeRedirect />
    </SessionProvider>,
  );
}

describe('HomeRedirect: la raíz `/` (pedido de Adrián, 2026-11-13)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  it('sin sesión lleva a /iniciar-sesion', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_REFRESH_INVALID', 401));

    renderRoot();

    expect(screen.getByText('Cargando Nimbo…')).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/iniciar-sesion'));
  });

  it.each([
    ['CLIENT', '/archivos'],
    ['ADMIN', '/interno'],
  ] as const)('con sesión de %s lleva al inicio de su rol', async (role, home) => {
    fetchMock.mockResolvedValue(jsonResponse(sessionFixture({ role })));

    renderRoot();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(home));
  });
});
