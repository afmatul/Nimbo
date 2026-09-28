/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';

import { useCountdown } from './use-countdown';

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('empieza en 60 s y baja con el temporizador', () => {
    const hook = renderHook(() => useCountdown());

    expect(hook.result.current).toBe(60);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(hook.result.current).toBe(59);
  });

  it('con un 429 usa los segundos de Retry-After', () => {
    const hook = renderHook(({ seconds }) => useCountdown(seconds), { initialProps: { seconds: 90 } });

    expect(hook.result.current).toBe(90);
    hook.rerender({ seconds: 30 });
    expect(hook.result.current).toBe(30);
  });
});
