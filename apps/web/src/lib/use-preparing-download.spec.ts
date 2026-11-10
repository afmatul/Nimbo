/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { PREPARING_DELAY_MS, usePreparingDownload } from './use-preparing-download';

interface Signed {
  readonly url: string;
}

interface Deferred {
  readonly promise: Promise<Signed>;
  readonly resolve: (value: Signed) => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<Signed>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SIGNED: Signed = { url: 'https://objetos.local/firmada' };

function renderDownload(requestUrl: (arg: string) => Promise<Signed>) {
  const onFailure = jest.fn();
  const openUrl = jest.fn();
  const hook = renderHook(() => usePreparingDownload<string>(requestUrl, onFailure, openUrl));
  return { hook, onFailure, openUrl };
}

describe('usePreparingDownload (RNF-14, 013b CA-3)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('CA-3: antes de 2 s no prepara; pasados 2 s guarda el argumento en «preparing»', async () => {
    const pending = deferred();
    const { hook } = renderDownload(() => pending.promise);

    let started: Promise<boolean> = Promise.resolve(false);
    act(() => {
      started = hook.result.current.download('f-1');
    });
    act(() => jest.advanceTimersByTime(PREPARING_DELAY_MS - 1));
    expect(PREPARING_DELAY_MS).toBe(2_000);
    expect(hook.result.current.preparing).toBeNull();

    act(() => jest.advanceTimersByTime(1));
    expect(hook.result.current.preparing).toBe('f-1');

    await act(async () => pending.resolve(SIGNED));
    await expect(started).resolves.toBe(true);
    expect(hook.result.current.preparing).toBeNull();
  });

  it('CA-3: abre la URL firmada con «openUrl» y no llama «onFailure»', async () => {
    const requestUrl = jest.fn(() => Promise.resolve(SIGNED));
    const { hook, onFailure, openUrl } = renderDownload(requestUrl);

    await act(async () => {
      await hook.result.current.download('f-1');
    });

    expect(requestUrl).toHaveBeenCalledWith('f-1');
    expect(openUrl).toHaveBeenCalledWith(SIGNED.url);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('CA-3: una petición a la vez: un segundo «download» en curso devuelve false sin pedir nada', async () => {
    const pending = deferred();
    const requestUrl = jest.fn(() => pending.promise);
    const { hook } = renderDownload(requestUrl);

    let second: boolean | undefined;
    act(() => {
      void hook.result.current.download('f-1');
    });
    await act(async () => {
      second = await hook.result.current.download('f-2');
    });

    expect(second).toBe(false);
    expect(requestUrl).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(SIGNED));
    await act(async () => {
      await hook.result.current.download('f-2');
    });
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it('CA-3: si falla, «onFailure» recibe el argumento, el error y cómo reintentar', async () => {
    const error = new TypeError('Failed to fetch');
    const requestUrl = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(SIGNED);
    const { hook, onFailure, openUrl } = renderDownload(requestUrl);

    let started: boolean | undefined;
    await act(async () => {
      started = await hook.result.current.download('f-1');
    });

    expect(started).toBe(true);
    expect(onFailure).toHaveBeenCalledWith('f-1', error, expect.any(Function));
    expect(hook.result.current.preparing).toBeNull();

    const retry = onFailure.mock.calls[0]?.[2] as () => void;
    await act(async () => retry());
    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(openUrl).toHaveBeenCalledWith(SIGNED.url);
  });

  it('un fallo de «openUrl» llega a «onFailure» sin rechazar «download» y libera el botón', async () => {
    const { hook, onFailure, openUrl } = renderDownload(() => Promise.resolve(SIGNED));
    const blocked = new Error('navegación bloqueada');
    openUrl.mockImplementationOnce(() => {
      throw blocked;
    });

    await act(async () => {
      await expect(hook.result.current.download('f-1')).resolves.toBe(true);
    });

    expect(onFailure).toHaveBeenCalledWith('f-1', blocked, expect.any(Function));
    expect(hook.result.current.preparing).toBeNull();
    await act(async () => {
      await expect(hook.result.current.download('f-1')).resolves.toBe(true);
    });
  });

  it('RNF-14: al desmontar limpia el temporizador de «Preparando…»', () => {
    const pending = deferred();
    const { hook } = renderDownload(() => pending.promise);
    act(() => {
      void hook.result.current.download('f-1');
    });

    hook.unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
