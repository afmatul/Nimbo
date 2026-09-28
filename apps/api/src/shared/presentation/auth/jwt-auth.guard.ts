import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Logger } from 'nestjs-pino';

import { ACCESS_TOKEN_STRATEGY } from '../../application/auth/i-access-token-verifier.port';
import type { AccessTokenClaims } from '../../application/auth/i-access-token-verifier.port';
import { createActor } from '../../domain/actor';
import { UnauthenticatedError } from '../../domain/errors';
import { ALL_ROLES } from '../../domain/role.enum';

import { IS_PUBLIC } from './public.decorator';
import { RequestPrincipal } from './request-principal';
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

const isAccessTokenClaims = (user: unknown): user is AccessTokenClaims => {
  if (typeof user !== 'object' || user === null) return false;
  const { userId, role, sessionId } = user as Record<string, unknown>;
  return (
    typeof userId === 'string' &&
    typeof sessionId === 'string' &&
    (ALL_ROLES as readonly unknown[]).includes(role)
  );
};

/** `TokenExpiredError` de `passport-jwt` o `[false, { reason: 'expired' }]` de la estrategia; lo demás es inválido. */
const isExpired = (info: unknown): boolean => {
  if (typeof info !== 'object' || info === null) return false;
  const { name, reason } = info as Record<string, unknown>;
  return name === 'TokenExpiredError' || reason === 'expired';
};

/** Errores que el flujo de autenticación produce a propósito: token vencido, inválido o aún no activo. */
const EXPECTED_ERROR_NAMES: readonly string[] = [
  'TokenExpiredError',
  'JsonWebTokenError',
  'NotBeforeError',
];
/** Tope del mensaje registrado de un error inesperado: basta para diagnosticar y limita lo que pueda arrastrar. */
export const UNEXPECTED_ERROR_MESSAGE_MAX = 200;

const isExpectedError = (err: unknown): boolean =>
  err instanceof UnauthenticatedError ||
  (err instanceof Error && EXPECTED_ERROR_NAMES.includes(err.name));

/** Clase y mensaje recortado de un error inesperado; de un valor que no es `Error`, solo su tipo (CA-16). */
const describeUnexpected = (err: unknown): { errorClass: string; errorMessage?: string } =>
  err instanceof Error
    ? {
        errorClass: err.constructor.name,
        errorMessage: err.message.slice(0, UNEXPECTED_ERROR_MESSAGE_MAX),
      }
    : { errorClass: typeof err };

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

  /**
   * Único punto que traduce el resultado de Passport (003 §6.2): *claims* → `Actor` en `RequestPrincipal` (nadie lee
   * `req.user`); cualquier otro resultado, incluidos `err` y la estrategia no registrada, es 401 y nunca 500. Un `err`
   * que no es un rechazo esperado se registra además como `auth.unexpected_error` para separar bugs de tokens malos.
   */
  override handleRequest<TUser = AccessTokenClaims>(
    err: unknown,
    user: unknown,
    info: unknown,
    ctx: ExecutionContext,
  ): TUser {
    const request = ctx.switchToHttp().getRequest<Request>();
    const failed = err !== null && err !== undefined;
    if (failed && !isExpectedError(err)) this.logUnexpected(request, err);
    if (!failed && isAccessTokenClaims(user)) {
      const actor = createActor(user.userId, user.role);
      RequestPrincipal.set(request, { actor, sessionId: user.sessionId });
      return user as TUser;
    }
    return this.reject(request, !failed && isExpired(info) ? 'expired_token' : 'invalid_token');
  }

  private isPublic(ctx: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) === true
    );
  }

  private logUnexpected(request: Request, err: unknown): void {
    this.logger.warn({
      event: 'auth.unexpected_error',
      route: routePatternOf(request),
      ...describeUnexpected(err),
    });
  }

  private reject(request: Request, reason: UnauthenticatedReason): never {
    this.logger.log({ event: 'auth.unauthenticated', route: routePatternOf(request), reason });
    throw new UnauthenticatedError();
  }
}
