import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Logger } from 'nestjs-pino';

import { ACCESS_TOKEN_STRATEGY } from '../../application/auth/i-access-token-verifier.port';
import { UnauthenticatedError } from '../../domain/errors';

import { IS_PUBLIC } from './public.decorator';
import { routePatternOf } from './route-pattern';

/** Una sola credencial `Bearer` con los caracteres de RFC 6750 §2.1, sin espacios de más. */
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;
const AUTHORIZATION_HEADER = 'authorization';

type UnauthenticatedReason =
  'missing_token' | 'malformed_authorization' | 'invalid_token' | 'expired_token';

/** Valores de `authorization` tal como llegaron: Node descarta los duplicados en `headers`, no en `rawHeaders`. */
const authorizationValues = (request: Request): string[] => {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    const value = request.rawHeaders[index + 1];
    if (name?.toLowerCase() === AUTHORIZATION_HEADER && value !== undefined) {
      values.push(value);
    }
  }
  return values;
};

const headerProblemOf = (request: Request): UnauthenticatedReason | undefined => {
  const values = authorizationValues(request);
  if (values.length === 0) return 'missing_token';
  const [value] = values;
  return values.length === 1 && value !== undefined && BEARER_PATTERN.test(value)
    ? undefined
    : 'malformed_authorization';
};

/**
 * Guard global de autenticación (003 D-2, §6.2). Extiende el de Passport con la estrategia `ACCESS_TOKEN_STRATEGY`
 * (la registra `identity`): `@Public()` pasa sin mirar la cabecera; si no, exige una sola cabecera `Bearer` bien
 * formada antes de llamar a Passport.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(ACCESS_TOKEN_STRATEGY) {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: Logger,
  ) {
    super();
  }

  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.isPublic(ctx)) return true;
    const request = ctx.switchToHttp().getRequest<Request>();
    const problem = headerProblemOf(request);
    if (problem !== undefined) this.reject(request, problem);
    try {
      return (await super.canActivate(ctx)) as boolean;
    } catch (error) {
      if (error instanceof UnauthenticatedError) throw error;
      return this.handleRequest(error, false, undefined, ctx);
    }
  }

  private isPublic(ctx: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) === true
    );
  }

  private reject(request: Request, reason: UnauthenticatedReason): never {
    this.logger.log({ event: 'auth.unauthenticated', route: routePatternOf(request), reason });
    throw new UnauthenticatedError();
  }
}
