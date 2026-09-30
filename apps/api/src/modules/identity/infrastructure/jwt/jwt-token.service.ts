import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { z } from 'zod';

import { I_CLOCK, Role } from '../../../../shared';
import type {
  AccessTokenClaims,
  AccessTokenVerification,
  IAccessTokenVerifier,
  IClock,
} from '../../../../shared';
import type {
  IssueAccessTokenInput,
  IssuedAccessToken,
  ITokenService,
} from '../../application/ports/i-token-service.port';

import { ACCESS_TOKEN_OPTIONS } from './access-token-options';
import type { AccessTokenOptions } from './access-token-options';

const MS_PER_SECOND = 1000;

/** *Claims* exactos del token de acceso (RN-10): ni uno de más ni uno de menos. */
const accessTokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    rol: z.nativeEnum(Role),
    sid: z.string().uuid(),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();

const INVALID: AccessTokenVerification = { valid: false, reason: 'invalid' };
const EXPIRED: AccessTokenVerification = { valid: false, reason: 'expired' };

/**
 * Emite y verifica el token de acceso (plan §6.4, RN-10, ADR-0017 c.2): HS256 con los *claims* `sub`, `rol`, `sid`,
 * `iat` y `exp`. `iat`/`exp` salen de `IClock` (no de `expiresIn`) y la verificación usa el mismo reloj con
 * `clockTimestamp`, así `FixedClock` controla el vencimiento. Es el único que decide firma, algoritmo y vencimiento.
 */
@Injectable()
export class JwtTokenService implements ITokenService, IAccessTokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ACCESS_TOKEN_OPTIONS) private readonly options: AccessTokenOptions,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedAccessToken> {
    const iat = this.nowSeconds();
    const exp = iat + this.options.ttlSeconds;
    const token = await this.jwt.signAsync(
      { sub: input.userId, rol: input.role, sid: input.sessionId, iat, exp },
      { secret: this.options.secret, algorithm: this.options.algorithms[0] },
    );
    return { token, expiresAt: new Date(exp * MS_PER_SECOND) };
  }

  /** Nunca lanza por un token malo: vencido → `expired`; cualquier otro fallo → `invalid`. */
  async verify(token: string): Promise<AccessTokenVerification> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(token, {
        secret: this.options.secret,
        algorithms: [...this.options.algorithms],
        clockTimestamp: this.nowSeconds(),
      });
    } catch (error) {
      return error instanceof TokenExpiredError ? EXPIRED : INVALID;
    }
    const claims = this.parseAccessTokenClaims(payload);
    return claims === null ? INVALID : { valid: true, claims };
  }

  private parseAccessTokenClaims(payload: unknown): AccessTokenClaims | null {
    const parsed = accessTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    const { sub, rol, sid } = parsed.data;
    return { userId: sub, role: rol, sessionId: sid };
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
  }
}
