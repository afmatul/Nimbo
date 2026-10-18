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

  describe('verify (T-25)', () => {
    const CLAIMS = { userId: INPUT.userId, role: INPUT.role, sessionId: INPUT.sessionId };
    const OTHER_SECRET = 'otra-clave-que-el-verificador-no-conoce-de-32-caracteres';
    const payload = (): Record<string, unknown> => ({
      sub: INPUT.userId,
      rol: INPUT.role,
      sid: INPUT.sessionId,
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 900,
    });
    const sign = (
      claims: Record<string, unknown>,
      secret = SECRET,
      algorithm: 'HS256' | 'HS512' = 'HS256',
    ): string => new JwtService().sign(claims, { secret, algorithm });
    const tamper = (token: string): string => {
      const signatureStart = token.lastIndexOf('.') + 1;
      const replacement = token.charAt(signatureStart) === 'A' ? 'B' : 'A';
      return `${token.slice(0, signatureStart)}${replacement}${token.slice(signatureStart + 1)}`;
    };
    const unsigned = (): string => {
      const encode = (value: object): string =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload())}.`;
    };
    const without = (claim: string): Record<string, unknown> => {
      const { [claim]: _omitted, ...rest } = payload();
      return rest;
    };

    it('CA-26: un token emitido es válido y da `userId`, `role`, `sessionId` y su `expiresAt`', async () => {
      const { token, expiresAt } = await service.issueAccessToken(INPUT);

      await expect(service.verify(token)).resolves.toEqual({
        valid: true,
        claims: CLAIMS,
        expiresAt,
      });
    });

    it('CA-12: a los 899 s sigue válido y a los 900 s según el reloj vence', async () => {
      const { token } = await service.issueAccessToken(INPUT);

      clock.advance(899_000);
      await expect(service.verify(token)).resolves.toMatchObject({ valid: true });

      clock.advance(1_000);
      await expect(service.verify(token)).resolves.toEqual({ valid: false, reason: 'expired' });
    });

    it.each<[string, () => string]>([
      ['alterado en un carácter', () => tamper(sign(payload()))],
      ['firmado con otra clave', () => sign(payload(), OTHER_SECRET)],
      ['con `alg: none`', unsigned],
      ['firmado con HS512', () => sign(payload(), SECRET, 'HS512')],
      ['con `sub` que no es uuid', () => sign({ ...payload(), sub: 'ana@nimbo.me' })],
      ['con `sid` que no es uuid', () => sign({ ...payload(), sid: 'sesion-1' })],
      ['con un `rol` fuera de `Role`', () => sign({ ...payload(), rol: 'ROOT' })],
      [
        'con el claim `role` en lugar de `rol`',
        () => sign({ ...without('rol'), role: INPUT.role }),
      ],
      ['con un claim de más', () => sign({ ...payload(), email: 'ana@nimbo.me' })],
      ['sin `sid`', () => sign(without('sid'))],
      ['sin `exp`', () => sign(without('exp'))],
      ['sin forma de JWT', () => 'no-es-un-jwt'],
      ['vacío', () => ''],
    ])('CA-26: un token %s es `invalid` y no lanza', async (_case, build) => {
      await expect(service.verify(build())).resolves.toEqual({ valid: false, reason: 'invalid' });
    });
  });
});
