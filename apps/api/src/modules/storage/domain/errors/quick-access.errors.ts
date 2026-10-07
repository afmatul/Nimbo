import { InvalidInputError } from '../../../../shared/domain/errors';

/**
 * Fijar superaría `QUICK_ACCESS_MAX_PINNED` (CA-28). HTTP 422 con `details.maxPinned`: es un límite de regla, como la
 * profundidad, no un choque (plan 006 §9.2). Mismo texto que `quickAccessLimitMessage` de `contracts`, que el dominio
 * no importa (ADR-0008).
 */
export class QuickAccessLimitError extends InvalidInputError {
  readonly code = 'STORAGE_QUICK_ACCESS_LIMIT';

  constructor(maxPinned: number) {
    super(`Ya fijaste ${String(maxPinned)} elementos. Quita uno para fijar otro.`, undefined, {
      maxPinned,
    });
  }
}
