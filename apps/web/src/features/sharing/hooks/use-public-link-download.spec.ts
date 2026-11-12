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

import { usePublicLinkDownload } from './use-public-link-download';
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

/** La visita y su descarga juntas, como las usa la página, sin el `key` de la ficha. */
function useVisitWithDownload(api: PublicLinkVisitorApi, openUrl: (url: string) => void) {
  const visit = usePublicLinkVisit(api);
  return { ...visit, ...usePublicLinkDownload({ api, openUrl, visit }) };
}

function renderVisit(api: PublicLinkVisitorApi, openUrl = jest.fn()) {
  const hook = renderHook(() => useVisitWithDownload(api, openUrl), { wrapper: StrictMode });
  return { hook, openUrl };
}

async function renderReady(api: PublicLinkVisitorApi, openUrl = jest.fn()) {
  const rendered = renderVisit(api, openUrl);
  await waitFor(() => expect(rendered.hook.result.current.state.status).toBe('ready'));
  return rendered;
}

describe('usePublicLinkDownload (013b CA-3 a CA-8)', () => {
  beforeEach(() => goTo(`#${TOKEN}`));

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

  it('CA-6, CA-8: un `404` tardío de la descarga del enlace anterior no deja el nuevo en carga', async () => {
    const api = fakeApi();
    let failDownload: (error: unknown) => void = () => undefined;
    api.download.mockReturnValueOnce(new Promise((_resolve, reject) => (failDownload = reject)));
    const { hook } = await renderReady(api);
    act(() => void hook.result.current.download());

    pasteLink('#otro-token');
    await waitFor(() => expect(api.open).toHaveBeenLastCalledWith('otro-token'));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    await act(async () =>
      failDownload(apiError(SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE, 404)),
    );

    expect(hook.result.current.state.status).toBe('ready');
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
