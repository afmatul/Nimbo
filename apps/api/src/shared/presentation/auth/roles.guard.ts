import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Logger } from 'nestjs-pino';

import type { Actor } from '../../domain/actor';
import { InsufficientRoleError } from '../../domain/errors';
import type { Role } from '../../domain/role.enum';

import { IS_PUBLIC } from './public.decorator';
import { RequestPrincipal } from './request-principal';
import { ROLES_KEY } from './roles.decorator';
import { routePatternOf } from './route-pattern';

type ForbiddenReason = 'role_not_allowed' | 'undeclared_route';

/**
 * Guard global de rol (003 D-10, §6.2); corre después de `JwtAuthGuard`. Una ruta no pública sin `@Roles(...)` se
 * cierra con 403 (DT-2); un rol no listado, también.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: Logger,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true) {
      return true;
    }
    const { actor } = RequestPrincipal.require(ctx);
    const required = this.reflector.getAllAndOverride<readonly Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (required === undefined) return this.reject(ctx, actor, 'undeclared_route', []);
    if (!required.includes(actor.role)) {
      return this.reject(ctx, actor, 'role_not_allowed', required);
    }
    return true;
  }

  private reject(
    ctx: ExecutionContext,
    actor: Actor,
    reason: ForbiddenReason,
    requiredRoles: readonly Role[],
  ): never {
    this.logger.warn({
      event: 'auth.forbidden',
      route: routePatternOf(ctx.switchToHttp().getRequest<Request>()),
      actorId: actor.id,
      role: actor.role,
      reason,
      requiredRoles,
    });
    throw new InsufficientRoleError();
  }
}
