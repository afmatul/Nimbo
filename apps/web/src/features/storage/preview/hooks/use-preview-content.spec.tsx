/** @jest-environment jsdom */
import type { PreviewUrlResponse } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import type { PreviewState } from './use-preview';
import { usePreviewContent } from './use-preview-content';

const delivery: PreviewUrlResponse = {
  file: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Imagen.png',
    kind: 'imagen',
    folderId: null,
    sizeBytes: 8,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  url: 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE',
  expiresAt: '2026-10-10T10:05:00.000Z',
};
const success: PreviewState = { status: 'success', delivery };
const BEFORE_EXPIRY = new Date('2026-10-10T10:04:59.999Z');
const AT_EXPIRY = new Date('2026-10-10T10:05:00.000Z');
const AFTER_EXPIRY = new Date('2026-10-10T10:06:00.000Z');

describe('estado de lectura acotado del shell', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('CA-9: progreso de lectura aparece después de 2 s y ready limpia el timer', () => {
    const { result } = renderHook(() => usePreviewContent(success, 1));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: false });
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: true });
    act(() => result.current.onReady());
    expect(result.current.state.status).toBe('success');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('CA-2: conserva solo una razón cerrada del reader, sin correlación ni detalles privados', () => {
    const { result } = renderHook(() => usePreviewContent(success, 1));
    act(() => result.current.onFailure({ reason: 'corrupt', correlationId: delivery.url }));
    expect(result.current.state).toEqual({
      status: 'failure',
      failure: { reason: 'corrupt', correlationId: '' },
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('CA-2: generación nueva con misma URL descarta ready/failure viejos', () => {
    const { result, rerender } = renderHook(
      ({ generation }) => usePreviewContent(success, generation),
      {
        initialProps: { generation: 1 },
      },
    );
    const previous = result.current;
    rerender({ generation: 2 });
    act(() => result.current.onReady());
    act(() => {
      previous.onFailure({ reason: 'corrupt', correlationId: '' });
      previous.onReady();
    });
    expect(result.current.state.status).toBe('success');
  });

  it('CA-2: retire espera cleanup, invalida callbacks y no permite dos reintentos simultáneos', async () => {
    let finish = (): void => {
      throw new Error('Falta cleanup');
    };
    const cleanup = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => usePreviewContent(success, 1));
    result.current.registerCleanup(cleanup);
    const pending = result.current.retire();
    let done = false;
    void pending.then(() => {
      done = true;
    });
    expect(done).toBe(false);
    expect(await result.current.retire()).toBe(false);
    await act(async () => finish());
    expect(await pending).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    act(() => result.current.onFailure({ reason: 'unavailable', correlationId: '' }));
    expect(result.current.state.status).not.toBe('failure');
  });

  it('CA-7: salir durante cleanup no autoriza reemisión posterior', async () => {
    let finish = (): void => {
      throw new Error('Falta cleanup');
    };
    const { result, unmount } = renderHook(() => usePreviewContent(success, 1));
    result.current.registerCleanup(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = result.current.retire();
    unmount();
    finish();
    expect(await pending).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('CA-9/T-08: PDF espera representación y muestra progreso hasta ready', () => {
    const pdf: PreviewState = {
      status: 'success',
      delivery: {
        ...delivery,
        file: { ...delivery.file, kind: 'pdf' },
      },
    };
    const { result } = renderHook(() => usePreviewContent(pdf, 1));
    expect(result.current.state.status).toBe('loading');
    expect(result.current.state.status === 'loading' && !result.current.state.prolonged).toBe(true);
    act(() => jest.advanceTimersByTime(2001));
    expect(result.current.state).toEqual({ status: 'loading', prolonged: true });
    act(() => result.current.onReady());
    expect(result.current.state.status).toBe('success');
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['protected', 'corrupt', 'unavailable', 'memory', 'expired'] as const)(
    'CA-2/T-08: conserva categoría cerrada %s sin datos privados',
    (reason) => {
      jest.setSystemTime(BEFORE_EXPIRY);
      const { result } = renderHook(() => usePreviewContent(success, 1));
      act(() => result.current.onFailure({ reason, correlationId: delivery.url }));
      expect(result.current.state).toEqual({
        status: 'failure',
        failure: { reason, correlationId: '' },
      });
    },
  );

  it.each([
    ['vencida', AT_EXPIRY, 'expired'],
    ['vencida hace rato', AFTER_EXPIRY, 'expired'],
    ['vigente', BEFORE_EXPIRY, 'unavailable'],
  ] as const)('CA-2: unavailable con la URL %s (%s) se presenta como %s', (_label, now, reason) => {
    jest.setSystemTime(now);
    const { result } = renderHook(() => usePreviewContent(success, 1));
    act(() => result.current.onFailure({ reason: 'unavailable', correlationId: delivery.url }));
    expect(result.current.state).toEqual({
      status: 'failure',
      failure: { reason, correlationId: '' },
    });
  });

  it.each(['protected', 'corrupt', 'memory'] as const)(
    'CA-2: %s conserva su causa aunque la URL ya haya vencido',
    (reason) => {
      jest.setSystemTime(AFTER_EXPIRY);
      const { result } = renderHook(() => usePreviewContent(success, 1));
      act(() => result.current.onFailure({ reason, correlationId: '' }));
      expect(result.current.state).toEqual({
        status: 'failure',
        failure: { reason, correlationId: '' },
      });
    },
  );

  it('CA-2: fallo tardío de A vencida no clasifica ni rompe la entrega vigente B', () => {
    const fresh: PreviewState = {
      status: 'success',
      delivery: { ...delivery, expiresAt: '2026-10-10T10:12:00.000Z' },
    };
    jest.setSystemTime(AFTER_EXPIRY);
    const { result, rerender } = renderHook(
      ({ state, generation }) => usePreviewContent(state, generation),
      { initialProps: { state: success, generation: 1 } },
    );
    const previous = result.current;
    rerender({ state: fresh, generation: 2 });
    act(() => previous.onFailure({ reason: 'unavailable', correlationId: '' }));
    expect(result.current.state.status).toBe('loading');
    act(() => result.current.onFailure({ reason: 'unavailable', correlationId: '' }));
    expect(result.current.state).toEqual({
      status: 'failure',
      failure: { reason: 'unavailable', correlationId: '' },
    });
  });
});
