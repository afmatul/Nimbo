import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ACCESS_TOKEN_STRATEGY, I_ACCESS_TOKEN_VERIFIER } from '../../src/shared';
import type { AccessTokenClaims, IAccessTokenVerifier } from '../../src/shared';

import { TEST_ACCESS_TOKEN_ALGORITHM, TEST_ACCESS_TOKEN_SECRET } from './test-access-tokens';

type ValidateResult = AccessTokenClaims | [false, { readonly reason: 'expired' | 'invalid' }];

const extractToken = ExtractJwt.fromAuthHeaderAsBearerToken();

/**
 * Estrategia de prueba con la **misma forma** que la `JwtStrategy` de `identity` (003 §6.2, 002): `passport-jwt` con
 * HS256, `ignoreExpiration: true` (el vencimiento lo decide solo el puerto con `IClock`) y `validate` que delega en
 * `IAccessTokenVerifier`. Solo vive en `test/`; una app de prueba registra una sola estrategia `ACCESS_TOKEN_STRATEGY`.
 */
@Injectable()
export class TestJwtStrategy extends PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY) {
  constructor(@Inject(I_ACCESS_TOKEN_VERIFIER) private readonly verifier: IAccessTokenVerifier) {
    super({
      jwtFromRequest: extractToken,
      secretOrKey: TEST_ACCESS_TOKEN_SECRET,
      algorithms: [TEST_ACCESS_TOKEN_ALGORITHM],
      ignoreExpiration: true,
      passReqToCallback: true,
    });
  }

  /** Nunca lanza: un token rechazado es `[false, { reason }]`, que Passport entrega como `info` al guard. */
  async validate(request: Request): Promise<ValidateResult> {
    const token = extractToken(request);
    if (token === null) return [false, { reason: 'invalid' }];
    const verification = await this.verifier.verify(token);
    return verification.valid ? verification.claims : [false, { reason: verification.reason }];
  }
}
