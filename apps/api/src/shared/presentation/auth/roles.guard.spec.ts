import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Logger } from 'nestjs-pino';

import { createActor } from '../../domain/actor';
import { InsufficientRoleError, UnauthenticatedError } from '../../domain/errors';
import { Role } from '../../domain/role.enum';

import { Public } from './public.decorator';
import { RequestPrincipal } from './request-principal';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

const ROUTE_PATH = '/api/v1/__probe/admin';
const ACTOR_ID = '7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const SESSION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

@Roles(Role.ADMIN)
class AdminController {
  @Public()
  publicHandler(): void {
    return undefined;
  }

  adminHandler(): void {
    return undefined;
  }

  @Roles(Role.SUPPORT)
  supportHandler(): void {
    return undefined;
  }
}

class UndeclaredController {
  handler(): void {
    return undefined;
  }
}

const requestAs = (role?: Role): object => {
  const request = { method: 'GET', baseUrl: '', route: { path: ROUTE_PATH } };
  if (role !== undefined) {
    RequestPrincipal.set(request, { actor: createActor(ACTOR_ID, role), sessionId: SESSION_ID });
  }
  return request;
};

const contextFor = (
  request: object,
  controller: new () => object,
  handler: string,
): ExecutionContext =>
  ({
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const setup = (): { guard: RolesGuard; logger: Logger } => {
  const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;
  return { guard: new RolesGuard(new Reflector(), logger), logger };
};

describe('RolesGuard', () => {
  it('CA-5: una ruta @Public() pasa sin `Actor`', () => {
    const { guard } = setup();

    expect(guard.canActivate(contextFor(requestAs(), AdminController, 'publicHandler'))).toBe(true);
  });

  it('CA-5: un rol listado en el @Roles de clase pasa', () => {
    const { guard, logger } = setup();

    expect(
      guard.canActivate(contextFor(requestAs(Role.ADMIN), AdminController, 'adminHandler')),
    ).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('CA-6: un rol no listado → `InsufficientRoleError` con bitácora `role_not_allowed`', () => {
    const { guard, logger } = setup();

    expect(() =>
      guard.canActivate(contextFor(requestAs(Role.CLIENT), AdminController, 'adminHandler')),
    ).toThrow(InsufficientRoleError);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'auth.forbidden',
      route: `GET ${ROUTE_PATH}`,
      actorId: ACTOR_ID,
      role: Role.CLIENT,
      reason: 'role_not_allowed',
      requiredRoles: [Role.ADMIN],
    });
  });

  it('CA-5: el @Roles de método sobrescribe al de clase', () => {
    const { guard } = setup();

    expect(
      guard.canActivate(contextFor(requestAs(Role.SUPPORT), AdminController, 'supportHandler')),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(requestAs(Role.ADMIN), AdminController, 'supportHandler')),
    ).toThrow(InsufficientRoleError);
  });

  it('DT-2: una ruta sin @Public() ni @Roles() → 403 con bitácora `undeclared_route`', () => {
    const { guard, logger } = setup();

    expect(() =>
      guard.canActivate(contextFor(requestAs(Role.ADMIN), UndeclaredController, 'handler')),
    ).toThrow(InsufficientRoleError);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'auth.forbidden',
      route: `GET ${ROUTE_PATH}`,
      actorId: ACTOR_ID,
      role: Role.ADMIN,
      reason: 'undeclared_route',
      requiredRoles: [],
    });
  });

  it('CA-5: sin `Actor` en una ruta no pública → `UnauthenticatedError`', () => {
    const { guard } = setup();

    expect(() =>
      guard.canActivate(contextFor(requestAs(), AdminController, 'adminHandler')),
    ).toThrow(UnauthenticatedError);
  });
});
