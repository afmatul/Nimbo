import type { Role } from '../../domain/role.enum';

/**
 * Nombre de la estrategia de Passport para el token de acceso. `JwtAuthGuard` extiende
 * `AuthGuard(ACCESS_TOKEN_STRATEGY)`; la estrategia real la registra `identity` (002) con este nombre, de modo que
 * `shared` nunca importa `identity` (003 §11.2).
 */
export const ACCESS_TOKEN_STRATEGY = 'jwt';

export const I_ACCESS_TOKEN_VERIFIER = Symbol('I_ACCESS_TOKEN_VERIFIER');

/** Lo que el token de acceso afirma de quien llama. Solo lo produce un `IAccessTokenVerifier`. */
export interface AccessTokenClaims {
  readonly userId: string;
  readonly role: Role;
  readonly sessionId: string;
}

/**
 * Resultado de `verify`. Si es válido, `expiresAt` es el `exp` del token: el canal en vivo lo cierra a esa hora
 * (015 CA-4) sin volver a leer el JWT.
 */
export type AccessTokenVerification =
  | { readonly valid: true; readonly claims: AccessTokenClaims; readonly expiresAt: Date }
  | { readonly valid: false; readonly reason: 'expired' | 'invalid' };

/**
 * Puerto token → *claims* (003 D-2, 002 D-14, ADR-0010). Lo implementa `identity`; lo usan su `JwtStrategy` y el
 * *handshake* de `realtime` (015), así que hay un solo camino de verificación.
 */
export interface IAccessTokenVerifier {
  /**
   * Nunca lanza por un token malo: devuelve `valid: false`. Es el único que decide el vencimiento, con `IClock`
   * (la estrategia de Passport usa `ignoreExpiration: true`).
   */
  verify(token: string): Promise<AccessTokenVerification>;
}
