import type { ExecutionContext } from '@nestjs/common';

import type { Actor } from '../../domain/actor';
import { UnauthenticatedError } from '../../domain/errors';

export interface Principal {
  readonly actor: Actor;
  readonly sessionId: string;
}

/** Privado del módulo: ningún *parser*, cabecera ni middleware puede escribirlo (003 D-11, CA-4). */
const principals = new WeakMap<object, Principal>();

/**
 * Quién hace la petición, tal como lo dejó `JwtAuthGuard`. No usa `req.user` ni ninguna propiedad de la petición:
 * Passport escribe `req.user` y nadie lo lee.
 */
export const RequestPrincipal = {
  set(request: object, principal: Principal): void {
    principals.set(request, principal);
  },
  get(request: object): Principal | undefined {
    return principals.get(request);
  },
  /** El principal de la petición HTTP en curso; sin él, `UnauthenticatedError` (401). */
  require(ctx: ExecutionContext): Principal {
    const principal = principals.get(ctx.switchToHttp().getRequest<object>());
    if (principal === undefined) {
      throw new UnauthenticatedError();
    }
    return principal;
  },
} as const;
