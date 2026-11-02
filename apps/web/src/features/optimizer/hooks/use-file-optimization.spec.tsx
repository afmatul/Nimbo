/** @jest-environment jsdom */
import { OPTIMIZER_ERROR_CODES } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { StorageRequestError } from '../../storage/storage-request-error';
import {
  COMPLETED,
  ESTIMATING,
  fakeOptimizerApi,
  IMAGE_FILE_ID,
  optimizationStatus,
  OPTIMIZING,
} from '../test-optimization';

import { useFileOptimization } from './use-file-optimization';

async function flush(): Promise<void> {
  await act(async () => undefined);
}
async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
function visibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
}

describe('useFileOptimization (021 CA-6)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    visibility('visible');
  });
  afterEach(() => jest.useRealTimers());

  it('lee al abrir y no consulta periódicamente sin optimización', async () => {
    const api = fakeOptimizerApi();
    const { result } = renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    await flush();
    expect(api.status).toHaveBeenCalledWith(IMAGE_FILE_ID);
    expect(result.current.optimization).toBeNull();
    expect(result.current.loading).toBe(false);
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(1);
  });

  it('respeta pollAfterMs, vuelve a programar tras respuesta y se detiene en estimada', async () => {
    const api = fakeOptimizerApi({
      status: jest.fn().mockResolvedValueOnce(ESTIMATING).mockResolvedValue(optimizationStatus()),
    });
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    await flush();
    await tick(1699);
    expect(api.status).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(api.status).toHaveBeenCalledTimes(2);
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    COMPLETED,
    optimizationStatus({ state: 'no_conviene', keepOriginalDays: null }),
    optimizationStatus({ state: 'no_disponible', reason: 'animada', keepOriginalDays: null }),
    optimizationStatus({ state: 'descartada', reason: 'ahorro_minimo', keepOriginalDays: null }),
    optimizationStatus({ state: 'fallida', reason: 'integridad', keepOriginalDays: null }),
  ])('detiene polling en terminal $state y avisa éxito solo tras transición', async (terminal) => {
    const api = fakeOptimizerApi({
      status: jest.fn().mockResolvedValueOnce(OPTIMIZING).mockResolvedValue(terminal),
    });
    const completed = jest.fn();
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, completed));
    await flush();
    await tick(2300);
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(completed).toHaveBeenCalledTimes(terminal.state === 'completada' ? 1 : 0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('pausa oculta, sin timers acumulados, relee inmediatamente al volver visible', async () => {
    const api = fakeOptimizerApi({ status: jest.fn().mockResolvedValue(ESTIMATING) });
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    await flush();
    visibility('hidden');
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    visibility('visible');
    await flush();
    expect(api.status).toHaveBeenCalledTimes(2);
    await tick(1700);
    expect(api.status).toHaveBeenCalledTimes(3);
  });

  it('una respuesta en vuelo al ocultar no programa timers', async () => {
    let resolve!: (value: typeof ESTIMATING) => void;
    const api = fakeOptimizerApi({
      status: jest.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    });
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    visibility('hidden');
    await act(async () => resolve(ESTIMATING));
    expect(jest.getTimerCount()).toBe(0);
    visibility('visible');
    await flush();
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it('cambio de fileId descarta estado, timer y respuesta anteriores', async () => {
    let resolve!: (value: typeof ESTIMATING) => void;
    const api = fakeOptimizerApi({
      status: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValue(null),
    });
    const { result, rerender } = renderHook(({ id }) => useFileOptimization(api, id, jest.fn()), {
      initialProps: { id: IMAGE_FILE_ID },
    });
    rerender({ id: 'otro-archivo' });
    await flush();
    await act(async () => resolve(ESTIMATING));
    expect(result.current.optimization).toBeNull();
    expect(api.status).toHaveBeenLastCalledWith('otro-archivo');
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it('unmount limpia timers y listeners y descarta respuestas pendientes', async () => {
    const api = fakeOptimizerApi({ status: jest.fn().mockResolvedValue(OPTIMIZING) });
    const completed = jest.fn();
    const { unmount } = renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, completed));
    await flush();
    unmount();
    expect(jest.getTimerCount()).toBe(0);
    visibility('visible');
    act(() => window.dispatchEvent(new Event('online')));
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
  });

  it('error transitorio conserva intervalo con espera y no crea bucle agresivo', async () => {
    const api = fakeOptimizerApi({
      status: jest
        .fn()
        .mockResolvedValueOnce(ESTIMATING)
        .mockRejectedValueOnce(new TypeError('red'))
        .mockResolvedValue(optimizationStatus()),
    });
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    await flush();
    await tick(1700);
    expect(api.status).toHaveBeenCalledTimes(2);
    await tick(1699);
    expect(api.status).toHaveBeenCalledTimes(2);
    await tick(1701);
    expect(api.status).toHaveBeenCalledTimes(3);
    await tick(60_000);
    expect(api.status).toHaveBeenCalledTimes(3);
  });

  it('online relee inmediatamente y no repite aviso al reabrir una completada', async () => {
    const api = fakeOptimizerApi({ status: jest.fn().mockResolvedValue(COMPLETED) });
    const completed = jest.fn();
    renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, completed));
    await flush();
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(completed).not.toHaveBeenCalled();
  });

  it.each([
    ['hidden', new StorageRequestError(404, 'STORAGE_NODE_NOT_FOUND')],
    ['hidden', new StorageRequestError(403, 'AUTH_FORBIDDEN')],
    ['unavailable', new StorageRequestError(422, OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE)],
  ] as const)('una lectura válida posterior limpia `%s` tras %o', async (flag, failure) => {
    const api = fakeOptimizerApi({
      status: jest.fn().mockRejectedValueOnce(failure).mockResolvedValue(optimizationStatus()),
    });
    const { result } = renderHook(() => useFileOptimization(api, IMAGE_FILE_ID, jest.fn()));
    await flush();
    expect(result.current[flag]).toBe(true);

    act(() => window.dispatchEvent(new Event('online')));
    await flush();

    expect(result.current).toMatchObject({
      hidden: false,
      unavailable: false,
      error: null,
      optimization: optimizationStatus(),
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});
