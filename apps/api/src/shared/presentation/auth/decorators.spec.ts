import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { createActor } from '../../domain/actor';
import { UnauthenticatedError } from '../../domain/errors';
import { ALL_ROLES, Role } from '../../domain/role.enum';

import { CurrentActor } from './current-actor.decorator';
import { CurrentSessionId } from './current-session-id.decorator';
import { IS_PUBLIC, Public } from './public.decorator';
import { RequestPrincipal } from './request-principal';
import { Roles, ROLES_KEY } from './roles.decorator';

const ACTOR = createActor('7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', Role.CLIENT);
const SESSION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

@Roles(Role.ADMIN)
class DeclaredController {
  @Public()
  publicHandler(): void {
    return undefined;
  }

  @Roles(Role.SUPPORT, Role.OPERATOR)
  supportHandler(): void {
    return undefined;
  }

  inheritedHandler(): void {
    return undefined;
  }
}

@Public()
class PublicController {}

class ParamsController {
  actor(@CurrentActor() _actor: unknown): void {
    return undefined;
  }

  session(@CurrentSessionId() _sessionId: unknown): void {
    return undefined;
  }
}

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;

/** Extrae la fábrica que Nest registró para el único parámetro decorado del método. */
const paramFactoryOf = (method: keyof ParamsController): ParamFactory => {
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ParamsController, method) as Record<
    string,
    { factory: ParamFactory }
  >;
  const [entry] = Object.values(args);
  if (entry === undefined) throw new Error(`sin decorador de parámetro en ${method}`);
  return entry.factory;
};

const contextFor = (request: object): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

const handlerOf = (method: keyof DeclaredController): (() => void) =>
  DeclaredController.prototype[method];

describe('@Public() y @Roles()', () => {
  const reflector = new Reflector();
  const read = <T>(key: string, method: keyof DeclaredController): T | undefined =>
    reflector.getAllAndOverride<T>(key, [handlerOf(method), DeclaredController]);

  it('CA-4: @Public() escribe su metadato en clase y en método', () => {
    expect(reflector.get<boolean>(IS_PUBLIC, PublicController)).toBe(true);
    expect(read<boolean>(IS_PUBLIC, 'publicHandler')).toBe(true);
    expect(read<boolean>(IS_PUBLIC, 'supportHandler')).toBeUndefined();
  });

  it('CA-4: @Roles() de método manda sobre el de clase; sin @Roles de método se hereda el de clase', () => {
    expect(read(ROLES_KEY, 'supportHandler')).toEqual([Role.SUPPORT, Role.OPERATOR]);
    expect(read(ROLES_KEY, 'inheritedHandler')).toEqual([Role.ADMIN]);
  });

  it('CA-4: @Roles(...ALL_ROLES) declara los cuatro roles', () => {
    class OwnSessionController {
      @Roles(...ALL_ROLES)
      handler(): void {
        return undefined;
      }
    }

    expect(reflector.get(ROLES_KEY, OwnSessionController.prototype.handler)).toEqual([
      ...ALL_ROLES,
    ]);
  });

  it('CA-4: @Roles() sin argumentos no compila', () => {
    // @ts-expect-error `@Roles()` exige al menos un rol.
    const decorator = Roles();

    expect(typeof decorator).toBe('function');
  });
});

describe('@CurrentActor() y @CurrentSessionId()', () => {
  it('CA-4: @CurrentActor() devuelve el actor que guardó `RequestPrincipal`', () => {
    const request = {};
    RequestPrincipal.set(request, { actor: ACTOR, sessionId: SESSION_ID });

    expect(paramFactoryOf('actor')(undefined, contextFor(request))).toBe(ACTOR);
  });

  it('CA-4: @CurrentActor() lanza `UnauthenticatedError` si no hay principal', () => {
    expect(() => paramFactoryOf('actor')(undefined, contextFor({}))).toThrow(UnauthenticatedError);
  });

  it('CA-4: @CurrentActor() nunca lee `req.user`', () => {
    const request = { user: ACTOR };

    expect(() => paramFactoryOf('actor')(undefined, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
  });

  it('CA-4: @CurrentSessionId() devuelve el `sessionId` guardado', () => {
    const request = {};
    RequestPrincipal.set(request, { actor: ACTOR, sessionId: SESSION_ID });

    expect(paramFactoryOf('session')(undefined, contextFor(request))).toBe(SESSION_ID);
  });

  it('CA-4: @CurrentSessionId() lanza `UnauthenticatedError` si no hay principal', () => {
    const request = { user: { sessionId: SESSION_ID } };

    expect(() => paramFactoryOf('session')(undefined, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
  });
});
