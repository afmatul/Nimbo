import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { I_CLOCK } from '../../../../shared';
import type { IClock } from '../../../../shared';
import type {
  IssueAccessTokenInput,
  IssuedAccessToken,
  ITokenService,
} from '../../application/ports/i-token-service.port';

import { ACCESS_TOKEN_OPTIONS } from './access-token-options';
import type { AccessTokenOptions } from './access-token-options';

const MS_PER_SECOND = 1000;

/**
 * Emite el token de acceso (plan §6.4, RN-10): HS256 con los *claims* `sub`, `rol`, `sid`, `iat` y `exp`, calculados
 * con `IClock` (no con `expiresIn`) para que `FixedClock` los controle.
 */
@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ACCESS_TOKEN_OPTIONS) private readonly options: AccessTokenOptions,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async issueAccessToken(input: IssueAccessTokenInput): Promise<IssuedAccessToken> {
    const iat = Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
    const exp = iat + this.options.ttlSeconds;
    const token = await this.jwt.signAsync(
      { sub: input.userId, rol: input.role, sid: input.sessionId, iat, exp },
      { secret: this.options.secret, algorithm: this.options.algorithms[0] },
    );
    return { token, expiresAt: new Date(exp * MS_PER_SECOND) };
  }
}
