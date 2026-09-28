import { useEffect, useState } from 'react';

import { EMAIL_REQUEST_COOLDOWN_SECONDS } from '@nimbo/contracts';

/**
 * Cuenta regresiva en segundos. Por defecto 60. Si el padre pasa los segundos de `Retry-After`,
 * el efecto vuelve a empezar.
 */
export function useCountdown(seconds: number = EMAIL_REQUEST_COOLDOWN_SECONDS): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => {
      setRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return remaining;
}
