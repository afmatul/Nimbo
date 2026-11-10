/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { PREPARING_DELAY_MS } from '../../../lib/use-preparing-download';
import type { PublicLinkVisitorApi } from '../public-link-visitor-api';
import { PUBLIC_LINK_DETAILS, SIGNED_DOWNLOAD } from '../test-public-link';

import { usePublicLinkVisit } from './use-public-link-visit';

const TOKEN = 'AbC-123_xyz';

function apiError(code: string, status?: number, retryAfterSeconds?: number): ApiClientError {
  return new ApiClientError({
    code,
    message: code,
    correlationId: 'c-1',
    status,
    retryAfterSeconds,
  });
}

const NETWORK_DOWN = apiError('INTERNAL_ERROR');

function fakeApi(): jest.Mocked<PublicLinkVisitorApi> {
  return {
    open: jest.fn().mockResolvedValue(PUBLIC_LINK_DETAILS),
    download: jest.fn().mockResolvedValue(SIGNED_DOWNLOAD),
  };
}

function goTo(fragment: string): void {
  window.history.replaceState(null, '', `/enlace${fragment}`);
}

function pasteLink(fragment: string): void {
  act(() => {
    goTo(fragment);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function renderVisit(api: PublicLinkVisitorApi, openUrl = jest.fn()) {
  const hook = renderHook(() => usePublicLinkVisit(api, openUrl), { wrapper: StrictMode });
  return { hook, openUrl };
}

async function renderReady(api: PublicLinkVisitorApi, openUrl = jest.fn()) {
  const rendered = renderVisit(api, openUrl);
  await waitFor(() => expect(rendered.hook.result.current.state.status).toBe('ready'));
  return rendered;
}

describe('usePublicLinkVisit (013b CA-3, CA-5 a CA-8)', () => {
  beforeEach(() => goTo(`#${TOKEN}`));

  describe('al abrir', () => {
    it('CA-1, CA-8: empieza en «loading», abre con el fragmento crudo y no lo borra', async () => {
      const api = fakeApi();
      const { hook } = renderVisit(api);

      expect(hook.result.current.state).toEqual({ status: 'loading' });
      await waitFor(() =>
        expect(hook.result.current.state).toEqual({
          status: 'ready',
          details: PUBLIC_LINK_DETAILS,
        }),
      );
      expect(api.open).toHaveBeenCalledWith(TOKEN);
      expect(window.location.hash).toBe(`#${TOKEN}`);
    });

    it('CA-8: dentro de StrictMode hace un solo POST /open', async () => {
      const api = fakeApi();
      await renderReady(api);

      expect(api.open).toHaveBeenCalledTimes(1);
    });

    it('CA-5, CA-8: el resultado de un pedido anterior no pisa al de «Reintentar»', async () => {
      const api = fakeApi();
      let failFirst: (error: unknown) => void = () => undefined;
      api.open.mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)));
      const { hook } = renderVisit(api);
      await waitFor(() => expect(api.open).toHaveBeenCalledTimes(1));

      act(() => hook.result.current.reload());
      await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
      await act(async () => failFirst(apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE, 404)));

      expect(hook.result.current.state.status).toBe('ready');
    });

    it('CA-8: al recargar vuelve a ver la ficha con el token que sigue en la barra', async () => {
      const api = fakeApi();
      const first = await renderReady(api);
      first.hook.unmount();

      const reloaded = await renderReady(api);

      expect(api.open.mock.calls).toEqual([[TOKEN], [TOKEN]]);
      expect(reloaded.hook.result.current.state.status).toBe('ready');
    });

    it('CA-8: otro enlace pegado en la pestaña (`hashchange`) abre el token nuevo', async () => {
      const api = fakeApi();
      const { hook } = await renderReady(api);
      api.open.mockRejectedValueOnce(apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE, 404));

      pasteLink('#otro-token');

      await waitFor(() => expect(hook.result.current.state.status).toBe('unavailable'));
      expect(api.open.mock.calls).toEqual([[TOKEN], ['otro-token']]);
    });

    it('CA-8: un `hashchange` con el mismo token no repite la petición', async () => {
      const api = fakeApi();
      const { hook } = await renderReady(api);

      pasteLink(`#${TOKEN}`);

      expect(api.open).toHaveBeenCalledTimes(1);
      expect(hook.result.current.state.status).toBe('ready');
    });

    it.each([
      ['sin fragmento', ''],
      ['con el fragmento vacío', '#'],
    ])('CA-6: %s pasa a «unavailable» sin llamar a la API', async (_caso, fragment) => {
      goTo(fragment);
      const api = fakeApi();
      const { hook } = renderVisit(api);

      await waitFor(() => expect(hook.result.current.state.status).toBe('unavailable'));
      expect(api.open).not.toHaveBeenCalled();
    });

    it('CA-6: un `404` pasa a «unavailable»', async () => {
      const api = fakeApi();
      api.open.mockRejectedValue(apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE, 404));
      const { hook } = renderVisit(api);

      await waitFor(() => expect(hook.result.current.state).toEqual({ status: 'unavailable' }));
    });

    it('CA-5: un `429` pasa a «rate-limited» con la espera de la API', async () => {
      const api = fakeApi();
      api.open.mockRejectedValue(apiError(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 429, 900));
      const { hook } = renderVisit(api);

      await waitFor(() =>
        expect(hook.result.current.state).toEqual({
          status: 'rate-limited',
          retryAfterSeconds: 900,
        }),
      );
    });

    it.each([
      ['la red cae', NETWORK_DOWN],
      ['la API responde 5xx', apiError('INTERNAL_ERROR', 503)],
    ])('CA-7: si %s pasa a «load-error»', async (_caso, failure) => {
      const api = fakeApi();
      api.open.mockRejectedValue(failure);
      const { hook } = renderVisit(api);

      await waitFor(() => expect(hook.result.current.state).toEqual({ status: 'load-error' }));
    });

    it('CA-5, CA-7: «Reintentar» vuelve a pedir la ficha y pasa por «loading»', async () => {
      const api = fakeApi();
      api.open.mockRejectedValueOnce(NETWORK_DOWN);
      const { hook } = renderVisit(api);
      await waitFor(() => expect(hook.result.current.state.status).toBe('load-error'));

      act(() => hook.result.current.reload());

      expect(hook.result.current.state.status).toBe('loading');
      await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
      expect(api.open).toHaveBeenCalledTimes(2);
    });
  });

  describe('al descargar', () => {
    it('CA-3: abre la URL firmada y termina en «started»; sin contraseña no la envía', async () => {
      const api = fakeApi();
      const { hook, openUrl } = await renderReady(api);

      await act(() => hook.result.current.download());

      expect(api.download).toHaveBeenCalledWith(TOKEN, '');
      expect(openUrl).toHaveBeenCalledWith(SIGNED_DOWNLOAD.url);
      expect(hook.result.current.outcome).toEqual({ status: 'started' });
      expect(hook.result.current.preparing).toBe(false);
    });

    it('CA-3: con contraseña la pasa al cliente con el token del fragmento', async () => {
      const api = fakeApi();
      const { hook } = await renderReady(api);

      await act(() => hook.result.current.download('secreta-123'));

      expect(api.download).toHaveBeenCalledWith(TOKEN, 'secreta-123');
    });

    it('CA-3: pasados 2 s dice «preparing» y un segundo clic no pide otra URL', async () => {
      const api = fakeApi();
      let resolveUrl: (value: typeof SIGNED_DOWNLOAD) => void = () => undefined;
      api.download.mockReturnValue(new Promise((resolve) => (resolveUrl = resolve)));
      const { hook } = await renderReady(api);
      jest.useFakeTimers();

      act(() => void hook.result.current.download());
      act(() => jest.advanceTimersByTime(PREPARING_DELAY_MS));
      expect(hook.result.current.preparing).toBe(true);
      act(() => void hook.result.current.download());

      await act(async () => resolveUrl(SIGNED_DOWNLOAD));
      jest.useRealTimers();
      expect(api.download).toHaveBeenCalledTimes(1);
      expect(hook.result.current.preparing).toBe(false);
      expect(hook.result.current.outcome.status).toBe('started');
    });

    it('CA-4: una contraseña incorrecta termina en «password-invalid» con la ficha visible', async () => {
      const api = fakeApi();
      api.download.mockRejectedValue(
        apiError(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID, 403),
      );
      const { hook, openUrl } = await renderReady(api);

      await act(() => hook.result.current.download('otra-clave'));

      expect(hook.result.current.outcome).toEqual({ status: 'password-invalid' });
      expect(hook.result.current.state.status).toBe('ready');
      expect(openUrl).not.toHaveBeenCalled();
    });

    it('CA-5: un `429` termina en «rate-limited» con la espera y la ficha visible', async () => {
      const api = fakeApi();
      api.download.mockRejectedValue(apiError(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 429, 3_600));
      const { hook } = await renderReady(api);

      await act(() => hook.result.current.download('secreta-123'));

      expect(hook.result.current.outcome).toEqual({
        status: 'rate-limited',
        retryAfterSeconds: 3_600,
      });
      expect(hook.result.current.state.status).toBe('ready');
    });

    it('CA-6: un `404` al descargar pasa la página a «unavailable», sin ficha', async () => {
      const api = fakeApi();
      api.download.mockRejectedValue(apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE, 404));
      const { hook } = await renderReady(api);

      await act(() => hook.result.current.download());

      expect(hook.result.current.state).toEqual({ status: 'unavailable' });
      expect(hook.result.current.outcome).toEqual({ status: 'idle' });
    });

    it('CA-7: la red caída termina en «download-error»; «Reintentar» repite con la misma contraseña', async () => {
      const api = fakeApi();
      api.download.mockRejectedValueOnce(NETWORK_DOWN);
      const { hook, openUrl } = await renderReady(api);

      await act(() => hook.result.current.download('secreta-123'));
      const { outcome } = hook.result.current;
      expect(outcome.status).toBe('download-error');
      expect(hook.result.current.state.status).toBe('ready');

      await act(async () => {
        if (outcome.status === 'download-error') outcome.retry();
      });

      await waitFor(() => expect(hook.result.current.outcome).toEqual({ status: 'started' }));
      expect(api.download.mock.calls).toEqual([
        [TOKEN, 'secreta-123'],
        [TOKEN, 'secreta-123'],
      ]);
      expect(openUrl).toHaveBeenCalledTimes(1);
    });

    it('CA-3: un intento nuevo limpia el aviso anterior mientras pide la URL', async () => {
      const api = fakeApi();
      api.download.mockRejectedValueOnce(
        apiError(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID, 403),
      );
      api.download.mockReturnValueOnce(new Promise(() => undefined));
      const { hook } = await renderReady(api);
      await act(() => hook.result.current.download('otra-clave'));

      act(() => void hook.result.current.download('secreta-123'));

      expect(hook.result.current.outcome).toEqual({ status: 'idle' });
    });
  });

  it('CA-8: otro enlace pegado en la pestaña no arrastra el aviso de la descarga anterior', async () => {
    const api = fakeApi();
    const { hook } = await renderReady(api);
    await act(() => hook.result.current.download());

    pasteLink('#otro-token');

    expect(hook.result.current.outcome).toEqual({ status: 'idle' });
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
  });

  it('no guarda nada en el almacenamiento del navegador (spec §5)', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const api = fakeApi();
    const { hook } = await renderReady(api);

    await act(() => hook.result.current.download('secreta-123'));

    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });
});
