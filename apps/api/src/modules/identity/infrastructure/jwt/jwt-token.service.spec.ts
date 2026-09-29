import { JwtService } from '@nestjs/jwt';

import { FixedClock, Role } from '../../../../shared';

import { accessTokenOptionsFrom } from './access-token-options';
import { JwtTokenService } from './jwt-token.service';

const NOW = new Date('2026-09-30T14:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const SECRET = 'clave-de-prueba-del-token-de-acceso-de-al-menos-32-caracteres';
const INPUT = {
  userId: '0b6f2c1e-7a3d-4e59-9c1b-2d4e6f8a0b1c',
  role: Role.CLIENT,
  sessionId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
};

const decodeSegment = (token: string, index: number): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[index] ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('JwtTokenService', () => {
  let clock: FixedClock;
  let service: JwtTokenService;

  beforeEach(() => {
    clock = new FixedClock(NOW);
    service = new JwtTokenService(
      new JwtService(),
      accessTokenOptionsFrom({ JWT_ACCESS_SECRET: SECRET }),
      clock,
    );
  });

  describe('issueAccessToken (T-24)', () => {
    it('CA-26: el JWT lleva exactamente `sub`, `rol`, `sid`, `iat` y `exp`', async () => {
      const { token } = await service.issueAccessToken(INPUT);

      expect(decodeSegment(token, 1)).toEqual({
        sub: INPUT.userId,
        rol: INPUT.role,
        sid: INPUT.sessionId,
        iat: NOW_SECONDS,
        exp: NOW_SECONDS + 900,
      });
    });

    it('CA-26: la cabecera es `alg: HS256`', async () => {
      const { token } = await service.issueAccessToken(INPUT);

      expect(decodeSegment(token, 0)).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('CA-1: `iat` y `exp` salen del reloj y `expiresAt` coincide con `exp`', async () => {
      clock.advance(90_500);

      const { token, expiresAt } = await service.issueAccessToken(INPUT);
      const { iat, exp } = decodeSegment(token, 1) as { iat: number; exp: number };

      expect(iat).toBe(NOW_SECONDS + 90);
      expect(exp - iat).toBe(900);
      expect(expiresAt.toISOString()).toBe(new Date(exp * 1000).toISOString());
    });

    it('CA-26: la firma se verifica con la clave del entorno', async () => {
      const { token } = await service.issueAccessToken(INPUT);

      expect(() =>
        new JwtService().verify(token, {
          secret: SECRET,
          algorithms: ['HS256'],
          ignoreExpiration: true,
        }),
      ).not.toThrow();
    });
  });
});
