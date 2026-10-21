import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';

import { I_CLOCK, Role } from '../../src/shared';
import type { AccessTokenVerification, IAccessTokenVerifier, IClock } from '../../src/shared';

import { TEST_ACCESS_TOKEN_ALGORITHM, TEST_ACCESS_TOKEN_SECRET } from './test-access-tokens';

const MS_PER_SECOND = 1000;

/** *Claims* exactos del token de acceso: ni uno de más ni uno de menos. */
const payloadSchema = z
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
 * Verificador de prueba de `IAccessTokenVerifier` (003 §6.6): verifica los tokens de `TestAccessTokens` con
 * `@nestjs/jwt` (solo HS256) e ignora `exp` para decidir el vencimiento con el reloj de la prueba. Nunca lanza.
 */
@Injectable()
export class TestAccessTokenVerifier implements IAccessTokenVerifier {
  private readonly jwt = new JwtService();

  constructor(@Inject(I_CLOCK) private readonly clock: IClock) {}

  verify(token: string): Promise<AccessTokenVerification> {
    const parsed = payloadSchema.safeParse(this.decode(token));
    if (!parsed.success) {
      return Promise.resolve(INVALID);
    }
    const { sub, rol, sid, exp } = parsed.data;
    if (exp * MS_PER_SECOND <= this.clock.now().getTime()) {
      return Promise.resolve(EXPIRED);
    }
    return Promise.resolve({
      valid: true,
      claims: { userId: sub, role: rol, sessionId: sid },
      expiresAt: new Date(exp * MS_PER_SECOND),
    });
  }

  private decode(token: string): unknown {
    try {
      return this.jwt.verify<object>(token, {
        secret: TEST_ACCESS_TOKEN_SECRET,
        algorithms: [TEST_ACCESS_TOKEN_ALGORITHM],
        ignoreExpiration: true,
      });
    } catch {
      return undefined;
    }
  }
}
