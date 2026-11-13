/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';

import { errorResponse, jsonResponse } from '../../../lib/test-http';

import { SessionGate } from './session-gate';
import { forgetSession } from './session-memory';
import { SessionProvider } from './session-provider';
import { sessionFixture } from './test-session';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function renderGate(): void {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SessionGate>
        <p>Contenido privado</p>
      </SessionGate>
    </SessionProvider>,
  );
}

describe('SessionGate', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  it('CA-28: sin token muestra la carga mientras renueva y luego los hijos', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderGate();

    expect(screen.getByText('Cargando tu sesión…')).toBeTruthy();
    expect(screen.queryByText('Contenido privado')).toBeNull();

    resolveFetch(jsonResponse(sessionFixture()));
    expect(await screen.findByText('Contenido privado')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sin sesión recuperable → router.replace a /iniciar-sesion', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_REFRESH_INVALID', 401));

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/iniciar-sesion');
    });
    expect(screen.queryByText('Contenido privado')).toBeNull();
  });

  it('CA-8: sesión vencida → /iniciar-sesion?sesion=terminada', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_SESSION_EXPIRED', 401));

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/iniciar-sesion?sesion=terminada');
    });
  });
});
