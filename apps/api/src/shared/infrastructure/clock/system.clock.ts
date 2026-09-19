import type { IClock } from '../../domain/i-clock.port';

/** Implementación real de `IClock`; se provee bajo `I_CLOCK` en la raíz de composición. */
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
