/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';

import { errorResponse, jsonResponse } from '../../../lib/test-http';

import { forgetSession, rememberSession } from './session-memory';
import { SessionProvider, useSession } from './session-provider';
import { sessionFixture } from './test-session';

const API = 'http://localhost/api/v1';
const MINUTE = 60 * 1000;

function Probe(): JSX.Element {
  const session = useSession();
  return (
    <div>
      <p data-testid="status">{session.status}</p>
      <p data-testid="user">{session.user?.fullName ?? ''}</p>
      <p data-testid="token">{session.accessToken ?? ''}</p>
      <button type="button" onClick={() => void session.signOut()}>
        Salir
      </button>
    </div>
  );
}

function renderProvider(): void {
  render(
    <SessionProvider apiPublicUrl={API}>
      <Probe />
    </SessionProvider>,
  );
}

function refreshCalls(fetchMock: jest.Mock): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/auth/session/refresh'))
    .length;
}

describe('SessionProvider', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    forgetSession();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('CA-28: recarga sin token → renueva con la cookie y recupera el usuario', async () => {
    fetchMock.mockResolvedValue(jsonResponse(sessionFixture({ token: 'renovado' })));

    renderProvider();

    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('user').textContent).toBe('Ana López');
    expect(screen.getByTestId('token').textContent).toBe('renovado');
    expect(refreshCalls(fetchMock)).toBe(1);
  });

  it('CA-28: ningún token se escribe en localStorage, sessionStorage ni document.cookie', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const setCookie = jest.spyOn(Document.prototype, 'cookie', 'set');
    fetchMock.mockResolvedValue(jsonResponse(sessionFixture({ token: 'secreto' })));

    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    expect(setItem).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain('secreto');
  });

  it('usa la sesión recién abierta en memoria sin renovar', async () => {
    rememberSession(sessionFixture({ token: 'del-login' }));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('token').textContent).toBe('del-login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CA-7: programa la renovación un minuto antes de accessTokenExpiresAt', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    rememberSession(sessionFixture({ now, ttlMs: 15 * MINUTE, token: 'inicial' }));
    fetchMock.mockResolvedValue(
      jsonResponse(sessionFixture({ token: 'rotado', ttlMs: 15 * MINUTE })),
    );

    renderProvider();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(14 * MINUTE - 1000);
    });
    expect(refreshCalls(fetchMock)).toBe(0);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(refreshCalls(fetchMock)).toBe(1);
    expect(screen.getByTestId('token').textContent).toBe('rotado');
  });

  it('sin cookie de refresco queda unauthenticated', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_REFRESH_INVALID', 401));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
  });

  it('CA-8: una sesión vencida queda ended y se olvida', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_SESSION_EXPIRED', 401));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('ended');
    });
    expect(screen.getByTestId('token').textContent).toBe('');
  });

  it('signOut llama a logout con credenciales y limpia la memoria', async () => {
    rememberSession(sessionFixture());
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Salir' }).click();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${API}/auth/session/logout`);
    expect(init?.credentials).toBe('include');
    expect(screen.getByTestId('token').textContent).toBe('');
  });
});
