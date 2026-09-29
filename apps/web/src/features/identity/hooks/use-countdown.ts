import { EMAIL_REQUEST_COOLDOWN_SECONDS } from '@nimbo/contracts';
import { useEffect, useState } from 'react';

/**
 * Cuenta regresiva en segundos. Por defecto 60. Si el padre pasa los segundos de `Retry-After`,
 * el efecto vuelve a empezar.
 */
export function useCountdown(seconds: number = EMAIL_REQUEST_COOLDOWN_SECONDS): number {
  const [startedAt, setStartedAt] = useState(seconds);
  const [remaining, setRemaining] = useState(seconds);

  if (startedAt !== seconds) {
    setStartedAt(seconds);
    setRemaining(seconds);
  }

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => {
      setRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return remaining;
}
