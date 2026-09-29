/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { useVerifyEmail } from './use-verify-email';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('useVerifyEmail', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.localStorage.clear();
    window.history.replaceState(null, '', '/verificar-correo');
  });

  it('borra el fragmento antes del POST y solo llama a API_PUBLIC_URL', async () => {
    const order: string[] = [];
    window.history.replaceState(null, '', '/verificar-correo#token=abc');
    const tracked = jest.spyOn(window.history, 'replaceState');
    tracked.mockImplementation((state, title, url) => {
      order.push(`replace:${String(url)}`);
      tracked.mockRestore();
      window.history.replaceState(state, title, url);
    });
    fetchMock.mockImplementation((input) => {
      order.push(`fetch:${String(input)}`);
      return Promise.resolve(jsonResponse({ status: 'verified' }));
    });

    const hook = renderHook(() => useVerifyEmail('http://localhost/api/v1'));
    await waitFor(() => {
      expect(hook.result.current.status).toBe('exito');
    });

    expect(order[0]).toBe('replace:/verificar-correo');
    expect(order[1]).toBe('fetch:http://localhost/api/v1/auth/verify-email');
    expect(window.location.hash).toBe('');
    expect(
      fetchMock.mock.calls.every((call) => String(call[0]).startsWith('http://localhost/api/v1')),
    ).toBe(true);
  });

  it('hace un solo POST dentro de StrictMode', async () => {
    window.history.replaceState(null, '', '/verificar-correo#token=unico');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));

    const hook = renderHook(() => useVerifyEmail('http://localhost/api/v1'), {
      wrapper: StrictMode,
    });
    await waitFor(() => {
      expect(hook.result.current.status).toBe('exito');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin fragmento no llama a la API y queda en enlace-invalido', async () => {
    const hook = renderHook(() => useVerifyEmail('http://localhost/api/v1'));
    await waitFor(() => {
      expect(hook.result.current.status).toBe('enlace-invalido');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function pasteLink(fragment: string): void {
    act(() => {
      window.history.replaceState(null, '', `/verificar-correo${fragment}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }

  function postedTokens(): string[] {
    return fetchMock.mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body)) as { token: string };
      return body.token;
    });
  }

  it('otro enlace pegado en la misma pestaña verifica el token nuevo', async () => {
    window.history.replaceState(null, '', '/verificar-correo#token=primero');
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'verified' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'already-verified' }));

    const hook = renderHook(() => useVerifyEmail('http://localhost/api/v1'), {
      wrapper: StrictMode,
    });
    await waitFor(() => {
      expect(hook.result.current.status).toBe('exito');
    });

    pasteLink('#token=segundo');
    await waitFor(() => {
      expect(hook.result.current.status).toBe('ya-verificado');
    });

    expect(postedTokens()).toEqual(['primero', 'segundo']);
    expect(window.location.hash).toBe('');
  });

  it('un cambio de fragmento sin token nuevo no vuelve a llamar a la API', async () => {
    window.history.replaceState(null, '', '/verificar-correo#token=unico');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));

    const hook = renderHook(() => useVerifyEmail('http://localhost/api/v1'));
    await waitFor(() => {
      expect(hook.result.current.status).toBe('exito');
    });

    pasteLink('#otra-cosa');
    pasteLink('#token=unico');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('exito');
    expect(window.location.hash).toBe('');
  });
});
