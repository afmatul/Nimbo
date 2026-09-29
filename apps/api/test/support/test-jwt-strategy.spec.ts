import type { Request } from 'express';

import { FixedClock, Role } from '../../src/shared';
import type { AccessTokenClaims } from '../../src/shared';

import { TestAccessTokenVerifier } from './test-access-token-verifier';
import { TestAccessTokens } from './test-access-tokens';
import { TestJwtStrategy } from './test-jwt-strategy';

const clock = new FixedClock(new Date('2026-09-27T12:00:00.000Z'));
const tokens = new TestAccessTokens(clock);
const CLAIMS: AccessTokenClaims = {
  userId: '3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b',
  role: Role.OPERATOR,
  sessionId: '6f5e4d3c-2b1a-4f9e-8d7c-6b5a4f3e2d1c',
};

const requestWithToken = (token: string): Request =>
  ({ headers: { authorization: `Bearer ${token}` } }) as unknown as Request;

describe('TestJwtStrategy.validate', () => {
  const strategy = new TestJwtStrategy(new TestAccessTokenVerifier(clock));

  it('CA-2: con un token válido devuelve los *claims* del verificador', async () => {
    await expect(strategy.validate(requestWithToken(tokens.valid(CLAIMS)))).resolves.toEqual(
      CLAIMS,
    );
  });

  it('CA-2: con un token vencido según el reloj devuelve `[false, { reason: "expired" }]`', async () => {
    await expect(strategy.validate(requestWithToken(tokens.expired()))).resolves.toEqual([
      false,
      { reason: 'expired' },
    ]);
  });

  it.each([
    ['con *claims* de más', tokens.withExtraClaim()],
    ['con un rol fuera de los cuatro', tokens.withUnknownRole()],
    ['sin forma de JWT', 'no-es-un-jwt'],
  ])('CA-2: con un token %s devuelve `[false, { reason: "invalid" }]`', async (_case, token) => {
    await expect(strategy.validate(requestWithToken(token))).resolves.toEqual([
      false,
      { reason: 'invalid' },
    ]);
  });

  it('CA-2: sin token en la petición devuelve `invalid` y nunca lanza', async () => {
    await expect(strategy.validate({ headers: {} } as unknown as Request)).resolves.toEqual([
      false,
      { reason: 'invalid' },
    ]);
  });
});
