import {
  InsufficientRoleError,
  Role,
  UnauthenticatedError,
  type AccessTokenVerification,
  type RateLimitDecision,
} from '../../../shared';
import { RealtimeTooManyRequestsError } from '../domain/errors';

import { ConnectionAdmission } from './connection-admission.service';
import type { RealtimeConfig } from './realtime-config';

const ORIGIN = '203.0.113.7';
const TOKEN = 'token-de-prueba';
const USER_ID = '7d2f0a4e-3c1b-4f5a-9e8d-1a2b3c4d5e6f';
const EXPIRES_AT = new Date('2026-10-16T12:15:00.000Z');

const CONFIG: RealtimeConfig = {
  origins: ['http://localhost:3002'],
  connectAttemptsPerMinute: 60,
  pingIntervalMs: 20_000,
  pingTimeoutMs: 15_000,
};

const validFor = (role: Role): AccessTokenVerification => ({
  valid: true,
  claims: { userId: USER_ID, role, sessionId: 'sesion-1' },
  expiresAt: EXPIRES_AT,
});

const setup = (
  verification: AccessTokenVerification = validFor(Role.CLIENT),
  decision: RateLimitDecision = { allowed: true },
) => {
  const verifier = { verify: jest.fn().mockResolvedValue(verification) };
  const rateLimiter = { consume: jest.fn().mockResolvedValue(decision) };
  const logger = { warn: jest.fn() };
  const admission = new ConnectionAdmission(verifier, rateLimiter, CONFIG, logger);
  return { admission, verifier, rateLimiter, logger };
};

const loggedReasons = (logger: { warn: jest.Mock }): unknown[] =>
  logger.warn.mock.calls.map(([payload]: [Record<string, unknown>]) => payload.reason);

describe('ConnectionAdmission (plan §2)', () => {
  it('CA-2: un token válido de cliente devuelve el actor y la hora de vencimiento', async () => {
    const { admission, verifier } = setup();

    const admitted = await admission.admit({ origin: ORIGIN, token: TOKEN });

    expect(verifier.verify).toHaveBeenCalledWith(TOKEN);
    expect(admitted.actor).toEqual({ id: USER_ID, role: Role.CLIENT, canReadContent: true });
    expect(admitted.expiresAt).toEqual(EXPIRES_AT);
  });

  it.each([
    ['sin token', undefined, 'missing_token'],
    ['con token vacío', '', 'missing_token'],
  ])('CA-2: %s rechaza con SHARED_UNAUTHENTICATED sin verificar', async (_, token, reason) => {
    const { admission, verifier, logger } = setup();

    await expect(admission.admit({ origin: ORIGIN, token })).rejects.toThrow(UnauthenticatedError);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(loggedReasons(logger)).toEqual([reason]);
  });

  it.each([
    ['inválido', 'invalid', 'invalid_token'],
    ['vencido', 'expired', 'expired_token'],
  ] as const)('CA-2: un token %s rechaza con SHARED_UNAUTHENTICATED', async (_, why, reason) => {
    const { admission, logger } = setup({ valid: false, reason: why });

    const rejection = admission.admit({ origin: ORIGIN, token: TOKEN });

    await expect(rejection).rejects.toThrow(UnauthenticatedError);
    expect(loggedReasons(logger)).toEqual([reason]);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-3: un %s con token vigente se rechaza con SHARED_FORBIDDEN',
    async (role) => {
      const { admission, logger } = setup(validFor(role));

      const rejection = admission.admit({ origin: ORIGIN, token: TOKEN });

      await expect(rejection).rejects.toThrow(InsufficientRoleError);
      expect(loggedReasons(logger)).toEqual(['forbidden_role']);
    },
  );

  it('CA-14: cuenta cada intento por origen con la regla configurada, antes de verificar', async () => {
    const { admission, rateLimiter } = setup();

    await admission.admit({ origin: ORIGIN, token: TOKEN });

    expect(rateLimiter.consume).toHaveBeenCalledWith(`ws:connect:${ORIGIN}`, [
      { limit: CONFIG.connectAttemptsPerMinute, windowSeconds: 60 },
    ]);
  });

  it('CA-14: sobre el umbral rechaza con REALTIME_TOO_MANY_REQUESTS y la espera, sin verificar', async () => {
    const { admission, verifier, logger } = setup(validFor(Role.CLIENT), {
      allowed: false,
      retryAfterSeconds: 42,
    });

    const error: unknown = await admission
      .admit({ origin: ORIGIN, token: TOKEN })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RealtimeTooManyRequestsError);
    expect((error as RealtimeTooManyRequestsError).retryAfterSeconds).toBe(42);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(loggedReasons(logger)).toEqual(['rate_limited']);
  });

  it('CA-14: si el limitador falla, rechaza con SHARED_UNAUTHENTICATED sin detalle (falla cerrado)', async () => {
    const { admission, verifier, rateLimiter, logger } = setup();
    rateLimiter.consume.mockRejectedValue(new Error('redis caído: detalle interno'));

    const error: unknown = await admission
      .admit({ origin: ORIGIN, token: TOKEN })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthenticatedError);
    expect((error as Error).message).not.toMatch(/redis/i);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'realtime.rejected',
      reason: 'limiter_failed',
      errorClass: 'Error',
    });
  });

  it('CA-13: la bitácora de rechazo nunca lleva el token', async () => {
    const { admission, logger } = setup({ valid: false, reason: 'invalid' });

    await admission.admit({ origin: ORIGIN, token: TOKEN }).catch(() => undefined);

    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
  });
});
