import { JwtService } from '@nestjs/jwt';

import { accessTokenOptionsFrom } from '../../src/modules/identity/infrastructure/jwt/access-token-options';
import { JwtTokenService } from '../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { SystemClock } from '../../src/shared';
import type { Env } from '../../src/shared';

/**
 * Emisor **real** de tokens de acceso (`JwtTokenService` de `identity`, 002) con la clave de `env`: sus tokens los acepta
 * la `JwtStrategy` real (`accessTokenStrategy: 'identity'`). No confundir con `TestAccessTokens`, el emisor HS256 de
 * `TestJwtStrategy` (003).
 */
export const realAccessTokenIssuer = (env: Pick<Env, 'JWT_ACCESS_SECRET'>): JwtTokenService =>
  new JwtTokenService(new JwtService(), accessTokenOptionsFrom(env), new SystemClock());
