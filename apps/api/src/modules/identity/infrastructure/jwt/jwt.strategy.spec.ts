import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { ACCESS_TOKEN_STRATEGY, Role } from '../../../../shared';
import type {
  AccessTokenClaims,
  AccessTokenVerification,
  IAccessTokenVerifier,
} from '../../../../shared';

import { accessTokenOptionsFrom } from './access-token-options';
import { JwtStrategy } from './jwt.strategy';

const SECRET = 'clave-de-prueba-del-token-de-acceso-de-al-menos-32-caracteres';
const CLAIMS: AccessTokenClaims = {
  userId: '0b6f2c1e-7a3d-4e59-9c1b-2d4e6f8a0b1c',
  role: Role.ADMIN,
  sessionId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
};
/** Muy en el pasado: solo pasa si la estrategia ignora el vencimiento y lo deja al puerto. */
const LONG_EXPIRED = { iat: 1_000_000_000, exp: 1_000_000_900 };

class FakeVerifier implements IAccessTokenVerifier {
  readonly received: string[] = [];

  constructor(private readonly result: AccessTokenVerification) {}

  verify(token: string): Promise<AccessTokenVerification> {
    this.received.push(token);
    return Promise.resolve(this.result);
  }
}

const sign = (secret = SECRET, algorithm: 'HS256' | 'HS512' = 'HS256'): string =>
  new JwtService().sign(
    { sub: CLAIMS.userId, rol: CLAIMS.role, sid: CLAIMS.sessionId, ...LONG_EXPIRED },
    { secret, algorithm },
  );

const requestWith = (authorization: string): Request =>
  ({ headers: { authorization } }) as unknown as Request;

interface Outcome {
  readonly success?: unknown;
  readonly fail?: unknown;
  readonly error?: unknown;
}

/** Corre la estrategia como lo hace Passport y devuelve con qué terminó. */
const authenticate = (strategy: JwtStrategy, request: Request): Promise<Outcome> =>
  new Promise((resolve) => {
    const passport = strategy as unknown as {
      success: (user: unknown) => void;
      fail: (info: unknown) => void;
      error: (error: unknown) => void;
      authenticate: (request: Request) => void;
    };
    passport.success = (user) => resolve({ success: user });
    passport.fail = (info) => resolve({ fail: info });
    passport.error = (error) => resolve({ error });
    passport.authenticate(request);
  });

const strategyWith = (verifier: IAccessTokenVerifier): JwtStrategy =>
  new JwtStrategy(accessTokenOptionsFrom({ JWT_ACCESS_SECRET: SECRET }), verifier);

describe('JwtStrategy (T-26, CA-26)', () => {
  it('CA-26: se registra con el nombre `ACCESS_TOKEN_STRATEGY`', () => {
    expect(strategyWith(new FakeVerifier({ valid: true, claims: CLAIMS })).name).toBe(
      ACCESS_TOKEN_STRATEGY,
    );
  });

  it('CA-26: con el puerto `valid` entrega los *claims* tal cual y le pasa el token Bearer', async () => {
    const verifier = new FakeVerifier({ valid: true, claims: CLAIMS });
    const token = sign();

    const outcome = await authenticate(strategyWith(verifier), requestWith(`Bearer ${token}`));

    expect(outcome).toEqual({ success: CLAIMS });
    expect(verifier.received).toEqual([token]);
  });

  it('CA-26: ignora `exp`: el vencimiento lo decide solo el puerto', async () => {
    const outcome = await authenticate(
      strategyWith(new FakeVerifier({ valid: true, claims: CLAIMS })),
      requestWith(`Bearer ${sign()}`),
    );

    expect(outcome).toEqual({ success: CLAIMS });
  });

  it.each(['expired', 'invalid'] as const)(
    'CA-26: con el puerto `%s` falla con ese motivo sin lanzar',
    async (reason) => {
      const outcome = await authenticate(
        strategyWith(new FakeVerifier({ valid: false, reason })),
        requestWith(`Bearer ${sign()}`),
      );

      expect(outcome).toEqual({ fail: { reason } });
    },
  );

  it.each([
    [
      'firmado con otra clave',
      `Bearer ${sign('otra-clave-que-la-estrategia-no-conoce-de-32-caracteres')}`,
    ],
    ['firmado con HS512', `Bearer ${sign(SECRET, 'HS512')}`],
    ['sin el esquema Bearer', sign()],
  ])('CA-26: un token %s no llega al puerto', async (_case, authorization) => {
    const verifier = new FakeVerifier({ valid: true, claims: CLAIMS });

    const outcome = await authenticate(strategyWith(verifier), requestWith(authorization));

    expect(outcome.success).toBeUndefined();
    expect(outcome.fail).toBeDefined();
    expect(verifier.received).toEqual([]);
  });
});
