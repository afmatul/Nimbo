/** @jest-environment jsdom */
import type { PreviewUrlResponse } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { ApiClientError } from '../../../../lib/api-error';
import type { PreviewUrlRequester } from '../api';

import { usePreview } from './use-preview';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const delivery = (id = FILE_ID, suffix = 'one'): PreviewUrlResponse => ({
  file: {
    id,
    name: 'Notas.txt',
    kind: 'texto',
    folderId: null,
    sizeBytes: 100,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  url: `https://objects.test/private-${suffix}?X-Amz-Signature=PRIVATE_SIGNATURE`,
  expiresAt: '2026-10-10T10:05:00.000Z',
});

function pendingDelivery() {
  let resolve: (value: PreviewUrlResponse) => void = () => {
    throw new Error('Promise no inicializado');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('Promise no inicializado');
  };
  const promise = new Promise<PreviewUrlResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const requester = (): jest.MockedFunction<PreviewUrlRequester> => jest.fn();

describe('usePreview T-06', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('CA-7: empieza loading y publica solamente la entrega de la emisión actual', async () => {
    const pending = pendingDelivery();
    const request = requester().mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    expect(result.current.state.status).toBe('loading');
    expect(request).toHaveBeenCalledWith(FILE_ID, expect.any(AbortSignal));
    await act(async () => pending.resolve(delivery()));
    expect(result.current.state.status).toBe('success');
    if (result.current.state.status !== 'success') throw new Error('Falta la entrega');
    expect(result.current.state.delivery.file.id).toBe(FILE_ID);
  });

  it('CA-9: a 1999 ms sigue normal y después de 2000 ms presenta espera prolongada', () => {
    const request = requester().mockReturnValue(pendingDelivery().promise);
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    act(() => jest.advanceTimersByTime(1999));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: true });
  });

  it('CA-9: retry y cambio de archivo reemplazan el timer, sin heredarlo ni reemitir al vencer', () => {
    const request = requester().mockImplementation(() => pendingDelivery().promise);
    const { result, rerender, unmount } = renderHook(({ id }) => usePreview(id, request), {
      initialProps: { id: FILE_ID },
    });
    act(() => jest.advanceTimersByTime(1500));
    act(() => result.current.retry());
    act(() => jest.advanceTimersByTime(501));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    expect(jest.getTimerCount()).toBe(1);
    rerender({ id: OTHER_ID });
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: true });
    expect(request).toHaveBeenCalledTimes(3);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['resolve', 'reject'] as const)(
    'CA-9: %s limpia el timer y no provoca otra emisión',
    async (finish) => {
      const pending = pendingDelivery();
      const request = requester().mockReturnValue(pending.promise);
      const { result } = renderHook(() => usePreview(FILE_ID, request));
      await act(async () =>
        finish === 'resolve'
          ? pending.resolve(delivery())
          : pending.reject(new Error('PRIVATE_MESSAGE')),
      );
      // React 19 deja una microtarea de act; drenarla no ejecuta los timeouts del visor.
      jest.runAllTicks();
      expect(jest.getTimerCount()).toBe(0);
      act(() => jest.advanceTimersByTime(5000));
      expect(result.current.state.status).toBe(finish === 'resolve' ? 'success' : 'failure');
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('CA-2: retry manual borra delivery anterior inmediatamente y pide una nueva', async () => {
    const next = pendingDelivery();
    const request = requester().mockResolvedValueOnce(delivery()).mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    await act(async () => undefined);
    expect(result.current.state.status).toBe('success');
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve(delivery(FILE_ID, 'new')));
    if (result.current.state.status !== 'success') throw new Error('Falta la nueva entrega');
    expect(result.current.state.delivery.url === delivery(FILE_ID, 'new').url).toBe(true);
  });

  it('CA-7: retry aborta y descarta un error genérico tardío de la petición anterior', async () => {
    const old = pendingDelivery();
    const next = pendingDelivery();
    const request = requester().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    act(() => result.current.retry());
    expect(request.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () =>
      old.reject(
        new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: 'PRIVATE_MESSAGE',
          correlationId: '',
        }),
      ),
    );
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    await act(async () => next.resolve(delivery()));
    expect(result.current.state.status).toBe('success');
  });

  it('CA-7: una respuesta vieja no reemplaza el éxito del retry aunque ignore AbortSignal', async () => {
    const old = pendingDelivery();
    const request = requester()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(delivery(FILE_ID, 'new'));
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    await act(async () => result.current.retry());
    await act(async () => old.resolve(delivery(FILE_ID, 'old')));
    if (result.current.state.status !== 'success') throw new Error('Falta la entrega vigente');
    expect(result.current.state.delivery.url === delivery(FILE_ID, 'new').url).toBe(true);
  });

  it('CA-7: cambiar fileId cancela A y no muestra su respuesta durante B', async () => {
    const old = pendingDelivery();
    const next = pendingDelivery();
    const request = requester().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ id }) => usePreview(id, request), {
      initialProps: { id: FILE_ID },
    });
    rerender({ id: OTHER_ID });
    expect(request.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () => old.resolve(delivery()));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    await act(async () => next.resolve(delivery(OTHER_ID)));
    if (result.current.state.status !== 'success') throw new Error('Falta la entrega B');
    expect(result.current.state.delivery.file.id).toBe(OTHER_ID);
  });

  it('CA-7: desmontar aborta, elimina el timer y silencia una cancelación transformada', async () => {
    const pending = pendingDelivery();
    const request = requester().mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePreview(FILE_ID, request));
    unmount();
    expect(request.mock.calls[0]?.[1].aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => pending.reject(new Error('PRIVATE_MESSAGE')));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('CA-2: retry crea otra generación aunque la URL reemitida sea la misma', async () => {
    const request = requester().mockResolvedValue(delivery());
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    await act(async () => undefined);
    const previous = result.current.generation;
    await act(async () => result.current.retry());
    expect(result.current.generation > previous).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('success');
  });

  it('Guardia transversal: no usa persistencia ni conserva datos privados en failures', async () => {
    const storage = jest.spyOn(Storage.prototype, 'setItem');
    const request = requester().mockRejectedValue(new Error(delivery().url));
    const { result } = renderHook(() => usePreview(FILE_ID, request));
    await act(async () => undefined);
    expect(result.current.state).toEqual({
      status: 'failure',
      failure: { reason: 'unexpected', correlationId: '' },
    });
    expect(storage).toHaveBeenCalledTimes(0);
    storage.mockRestore();
  });
});
