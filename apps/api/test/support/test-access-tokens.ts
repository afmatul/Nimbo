import { JwtService } from '@nestjs/jwt';

import { Role } from '../../src/shared';
import type { AccessTokenClaims, IClock } from '../../src/shared';

import type { AccessTokenVariants } from './access-token-verifier.contract';

/** Clave HS256 solo para pruebas; nunca se usa fuera de `test/`. */
export const TEST_ACCESS_TOKEN_SECRET = 'nimbo-test-access-token-secret-no-usar-fuera-de-pruebas';
const OTHER_SECRET = 'otra-clave-que-el-verificador-no-conoce-no-usar-fuera-de-pruebas';
export const TEST_ACCESS_TOKEN_ALGORITHM = 'HS256';
/** Mismo tiempo de vida que el token de acceso de 002 (D-10). */
const TTL_SECONDS = 15 * 60;
const EXPIRED_SECONDS_AGO = 60;
const MS_PER_SECOND = 1000;

export const DEFAULT_TEST_CLAIMS: AccessTokenClaims = {
  userId: '5a3e1c7b-2d4f-4a6b-8c9d-0e1f2a3b4c5d',
  role: Role.CLIENT,
  sessionId: 'c4b3a291-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
};

type TokenPayload = Record<string, unknown>;

const base64Url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Cambia el primer carácter de la firma: sus 6 bits son significativos, así que la firma deja de coincidir. */
const tamperSignature = (token: string): string => {
  const lastDot = token.lastIndexOf('.');
  const signature = token.slice(lastDot + 1);
  const replacement = signature.startsWith('A') ? 'B' : 'A';
  return `${token.slice(0, lastDot + 1)}${replacement}${signature.slice(1)}`;
};

/**
 * Emisor de tokens de acceso para pruebas (003 §6.6): HS256 con una clave de prueba, `iat`/`exp` según el reloj de la
 * prueba y los mismos *claims* que emite 002 (`sub`, `role`, `sid`). Fabrica también las variantes inválidas de la
 * suite de contrato.
 */
export class TestAccessTokens implements AccessTokenVariants {
  private readonly jwt = new JwtService();

  constructor(private readonly clock: IClock) {}

  valid(claims: AccessTokenClaims = DEFAULT_TEST_CLAIMS): string {
    return this.sign(this.payloadFor(claims));
  }

  forRole(role: Role, userId: string = DEFAULT_TEST_CLAIMS.userId): string {
    return this.valid({ ...DEFAULT_TEST_CLAIMS, role, userId });
  }

  expired(): string {
    const now = this.nowSeconds();
    const exp = now - EXPIRED_SECONDS_AGO;
    return this.sign({ ...this.payloadFor(DEFAULT_TEST_CLAIMS), iat: exp - TTL_SECONDS, exp });
  }

  tampered(): string {
    return tamperSignature(this.valid());
  }

  signedWithOtherKey(): string {
    return this.sign(this.payloadFor(DEFAULT_TEST_CLAIMS), OTHER_SECRET);
  }

  unsigned(): string {
    const header = base64Url({ alg: 'none', typ: 'JWT' });
    return `${header}.${base64Url(this.payloadFor(DEFAULT_TEST_CLAIMS))}.`;
  }

  signedWithHs512(): string {
    return this.jwt.sign(this.payloadFor(DEFAULT_TEST_CLAIMS), {
      secret: TEST_ACCESS_TOKEN_SECRET,
      algorithm: 'HS512',
    });
  }

  withExtraClaim(): string {
    return this.sign({ ...this.payloadFor(DEFAULT_TEST_CLAIMS), admin: true });
  }

  withMissingClaim(): string {
    const { sid: _omitted, ...withoutSession } = this.payloadFor(DEFAULT_TEST_CLAIMS);
    return this.sign(withoutSession);
  }

  withUnknownRole(): string {
    return this.sign({ ...this.payloadFor(DEFAULT_TEST_CLAIMS), role: 'ROOT' });
  }

  private payloadFor(claims: AccessTokenClaims): TokenPayload {
    const iat = this.nowSeconds();
    return {
      sub: claims.userId,
      role: claims.role,
      sid: claims.sessionId,
      iat,
      exp: iat + TTL_SECONDS,
    };
  }

  private sign(payload: TokenPayload, secret: string = TEST_ACCESS_TOKEN_SECRET): string {
    return this.jwt.sign(payload, { secret, algorithm: TEST_ACCESS_TOKEN_ALGORITHM });
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / MS_PER_SECOND);
  }
}
