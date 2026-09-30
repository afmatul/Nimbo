import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ACCESS_TOKEN_STRATEGY, I_ACCESS_TOKEN_VERIFIER } from '../../../../shared';
import type { AccessTokenClaims, IAccessTokenVerifier } from '../../../../shared';

import { ACCESS_TOKEN_OPTIONS } from './access-token-options';
import type { AccessTokenOptions } from './access-token-options';

type RejectionReason = 'expired' | 'invalid';
type ValidateResult = AccessTokenClaims | [false, { readonly reason: RejectionReason }];

const extractBearerToken = ExtractJwt.fromAuthHeaderAsBearerToken();

/**
 * Estrategia de Passport del token de acceso (plan §6.4, ADR-0017 c.2), registrada como `ACCESS_TOKEN_STRATEGY` para
 * que `JwtAuthGuard` de `shared` la encuentre sin importar `identity`. Firma y algoritmo salen de
 * `ACCESS_TOKEN_OPTIONS`; `ignoreExpiration: true` porque el vencimiento lo decide solo el puerto con `IClock`.
 * `validate` delega en `IAccessTokenVerifier` y nunca lanza: un rechazo es `[false, { reason }]`, que llega como `info`
 * a `JwtAuthGuard.handleRequest`. No interpreta *claims* ni arma el `Actor`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY) {
  constructor(
    @Inject(ACCESS_TOKEN_OPTIONS) options: AccessTokenOptions,
    @Inject(I_ACCESS_TOKEN_VERIFIER) private readonly verifier: IAccessTokenVerifier,
  ) {
    super({
      jwtFromRequest: extractBearerToken,
      secretOrKey: options.secret,
      algorithms: [...options.algorithms],
      ignoreExpiration: true,
      passReqToCallback: true,
    });
  }

  async validate(request: Request): Promise<ValidateResult> {
    const token = extractBearerToken(request);
    if (token === null) {
      return [false, { reason: 'invalid' }];
    }
    const verification = await this.verifier.verify(token);
    return verification.valid ? verification.claims : [false, { reason: verification.reason }];
  }
}
