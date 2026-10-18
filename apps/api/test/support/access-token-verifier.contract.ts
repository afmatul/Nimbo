import request from 'supertest';

import { createActor, Role } from '../../src/shared';
import type { AccessTokenClaims, FixedClock, IAccessTokenVerifier } from '../../src/shared';

/** Fábrica de tokens para la suite de contrato. 003 usa `TestAccessTokens`; 002, la de su emisor real. */
export interface AccessTokenVariants {
  /** Token válido con estos *claims*, vigente según el reloj de la prueba. */
  valid(claims: AccessTokenClaims): string;
  /** Firmado bien, pero con `exp` anterior a la hora del reloj de la prueba. */
  expired(): string;
  /** Token válido con un carácter de la firma cambiado. */
  tampered(): string;
  signedWithOtherKey(): string;
  /** Cabecera `alg: none` y firma vacía. */
  unsigned(): string;
  signedWithHs512(): string;
  withExtraClaim(): string;
  withMissingClaim(): string;
  withUnknownRole(): string;
}

export interface AccessTokenContractSubject {
  readonly verifier: IAccessTokenVerifier;
  readonly tokens: AccessTokenVariants;
  readonly clock: FixedClock;
}

const CLAIMS: AccessTokenClaims = {
  userId: '0b6f2c1e-7a3d-4e59-9c1b-2d4e6f8a0b1c',
  role: Role.SUPPORT,
  sessionId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
};
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MS_PER_SECOND = 1000;

/** `exp` del JWT tal como viene en el token: lo que el verificador debe devolver como `expiresAt` (015 CA-4). */
const expirationSecondsOf = (token: string): number => {
  const payload = token.split('.')[1] ?? '';
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number }).exp;
};

type InvalidCase = readonly [string, (tokens: AccessTokenVariants) => string];

const INVALID_TOKEN_CASES: readonly InvalidCase[] = [
  ['alterado en un carácter', (tokens) => tokens.tampered()],
  ['firmado con otra clave', (tokens) => tokens.signedWithOtherKey()],
  ['con `alg: none`', (tokens) => tokens.unsigned()],
  ['firmado con HS512', (tokens) => tokens.signedWithHs512()],
  ['con *claims* de más', (tokens) => tokens.withExtraClaim()],
  ['con *claims* de menos', (tokens) => tokens.withMissingClaim()],
  ['con un rol fuera de los cuatro', (tokens) => tokens.withUnknownRole()],
  ['sin forma de JWT', () => 'no-es-un-jwt'],
];

/**
 * Suite de contrato única de `IAccessTokenVerifier` (003 §6.2, ADR-0017 c.2, 002 CA-26), tramo **puerto**: `verify`
 * da el resultado esperado y nunca lanza. `subject` se evalúa dentro de cada prueba para admitir sujetos que se
 * construyen en un `beforeAll`.
 */
export const describeAccessTokenVerifierContract = (
  subject: () => AccessTokenContractSubject,
): void => {
  describe('contrato de IAccessTokenVerifier (puerto)', () => {
    it('CA-2: token válido → `valid: true` con `userId`, `role`, `sessionId` y `expiresAt` desde `exp`', async () => {
      const { verifier, tokens } = subject();
      const token = tokens.valid(CLAIMS);

      await expect(verifier.verify(token)).resolves.toEqual({
        valid: true,
        claims: CLAIMS,
        expiresAt: new Date(expirationSecondsOf(token) * MS_PER_SECOND),
      });
    });

    it('CA-2: token con `exp` pasado según el reloj → `reason: expired`', async () => {
      const { verifier, tokens } = subject();

      await expect(verifier.verify(tokens.expired())).resolves.toEqual({
        valid: false,
        reason: 'expired',
      });
    });

    it('CA-2: el vencimiento lo decide el reloj de la prueba, no la hora del sistema', async () => {
      const { verifier, tokens, clock } = subject();
      const token = tokens.valid(CLAIMS);
      const issuedAt = clock.now();

      clock.advance(ONE_DAY_MS);
      try {
        await expect(verifier.verify(token)).resolves.toEqual({ valid: false, reason: 'expired' });
      } finally {
        clock.set(issuedAt);
      }
    });

    it.each(INVALID_TOKEN_CASES)('CA-2: token %s → `reason: invalid`', async (_name, build) => {
      const { verifier, tokens } = subject();

      await expect(verifier.verify(build(tokens))).resolves.toEqual({
        valid: false,
        reason: 'invalid',
      });
    });
  });
};

/** Lo mínimo del arnés que usa el tramo HTTP; lo cumple `TestApp` de `test/int/setup`. */
export interface AccessTokenHttpContractSubject extends AccessTokenContractSubject {
  readonly server: Parameters<typeof request>[0];
  readonly logs: { lines(): readonly Record<string, unknown>[]; clear(): void };
}

const PROBE_ACTOR_PATH = '/api/v1/__probe/actor';
const REASON_BY_PORT_RESULT = { expired: 'expired_token', invalid: 'invalid_token' } as const;

const unauthenticatedReasons = (subject: AccessTokenHttpContractSubject): unknown[] =>
  subject.logs
    .lines()
    .filter((line) => line.event === 'auth.unauthenticated')
    .map((line) => line.reason);

/**
 * Tramo **HTTP** de la misma suite (003 §6.2, ADR-0017): los mismos tokens contra `GET /__probe/actor`, protegida por
 * los guards globales, dan lo mismo que `verify`: 200 con el mismo `Actor`, o 401 `SHARED_UNAUTHENTICATED` con el
 * motivo equivalente en la bitácora. 002 la corre con su verificador y su `JwtStrategy` reales.
 */
export const describeAccessTokenHttpContract = (
  subject: () => AccessTokenHttpContractSubject,
): void => {
  describe('contrato de IAccessTokenVerifier (HTTP)', () => {
    it('CA-2: token válido → 200 con el `Actor` de los *claims* que da el puerto', async () => {
      const { server, tokens, verifier } = subject();
      const token = tokens.valid(CLAIMS);

      const response = await request(server)
        .get(PROBE_ACTOR_PATH)
        .set('Authorization', `Bearer ${token}`);

      await expect(verifier.verify(token)).resolves.toMatchObject({ valid: true });
      expect(response.status).toBe(200);
      expect(response.body).toEqual(createActor(CLAIMS.userId, CLAIMS.role));
    });

    const REJECTED_CASES: readonly InvalidCase[] = [
      ['vencido según el reloj', (tokens) => tokens.expired()],
      ...INVALID_TOKEN_CASES,
    ];

    it.each(REJECTED_CASES)(
      'CA-2: token %s → 401 con el mismo motivo que el puerto',
      async (_name, build) => {
        const current = subject();
        const token = build(current.tokens);
        const verification = await current.verifier.verify(token);
        if (verification.valid) throw new Error('el puerto aceptó un token que debía rechazar');
        current.logs.clear();

        const response = await request(current.server)
          .get(PROBE_ACTOR_PATH)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
        expect(unauthenticatedReasons(current)).toEqual([
          REASON_BY_PORT_RESULT[verification.reason],
        ]);
      },
    );
  });
};
