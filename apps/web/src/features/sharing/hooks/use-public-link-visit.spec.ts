/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import type { PublicLinkVisitorApi } from '../public-link-visitor-api';
import { PUBLIC_LINK_DETAILS } from '../test-public-link';

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
    download: jest.fn(),
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

function renderVisit(api: PublicLinkVisitorApi) {
  const hook = renderHook(() => usePublicLinkVisit(api), { wrapper: StrictMode });
  return { hook };
}

async function renderReady(api: PublicLinkVisitorApi) {
  const rendered = renderVisit(api);
  await waitFor(() => expect(rendered.hook.result.current.state.status).toBe('ready'));
  return rendered;
}

describe('usePublicLinkVisit (013b CA-1, CA-5 a CA-8)', () => {
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
});
