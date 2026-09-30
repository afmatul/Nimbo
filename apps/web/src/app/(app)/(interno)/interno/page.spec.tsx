/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  forgetSession,
  recallSession,
  rememberSession,
} from '../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../lib/test-http';

import InternoPage from './page';

function renderPage(): void {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternoPage />
    </SessionProvider>,
  );
}

describe('área interna (/interno)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    forgetSession();
    rememberSession(sessionFixture({ role: 'SUPPORT' }));
  });

  it('CA-17: con una sesión de SUPPORT saluda por fullName y anuncia el área de soporte', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Hola, Ana López.' })).toBeTruthy();
    expect(screen.getByText('Tu área de soporte estará disponible pronto.')).toBeTruthy();
  });

  it('CA-17: «Cerrar sesión» usa la acción de cierre de 002', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => {
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'http://localhost/api/v1/auth/session/logout',
      );
    });
    expect(recallSession(Date.now())).toBeNull();
  });
});
