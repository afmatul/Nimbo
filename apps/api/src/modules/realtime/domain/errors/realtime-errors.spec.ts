import { DomainError, TooManyRequestsError } from '../../../../shared';

import { RealtimeTooManyRequestsError } from './index';

describe('errores de `realtime`', () => {
  it('CA-14: `RealtimeTooManyRequestsError` es un 429 con el tiempo de espera', () => {
    const error = new RealtimeTooManyRequestsError(42);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error.status).toBe(429);
    expect(error.code).toBe('REALTIME_TOO_MANY_REQUESTS');
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.message).toMatch(/\.$/);
  });
});
