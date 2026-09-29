import { RequestMethod } from '@nestjs/common';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';

import { IS_PUBLIC, ROLES_KEY } from '../../src/shared';
import type { Role } from '../../src/shared';

/** Lo que una ruta declara para los guards globales (003 §6.2): `@Public()`, `@Roles(...)`, ambas o ninguna. */
export interface RouteDeclaration {
  readonly method: string;
  readonly path: string;
  readonly public: boolean;
  readonly roles: readonly Role[];
}

/** Rutas que incumplen DT-2, como `MÉTODO /ruta`. */
export interface RouteDeclarationProblems {
  readonly undeclared: readonly string[];
  readonly declaresBoth: readonly string[];
}

type Handler = (...args: unknown[]) => unknown;

const pathsOf = (target: object): readonly string[] => {
  const value = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
  if (value === undefined) return ['/'];
  return typeof value === 'string' ? [value] : value;
};

const joinPath = (...segments: readonly string[]): string => {
  const parts = segments.flatMap((segment) => segment.split('/')).filter((part) => part !== '');
  return `/${parts.join('/')}`;
};

/** `MÉTODO /ruta`, como las nombran los informes de CA-3 y CA-7. */
export const describeRoute = (route: RouteDeclaration): string => `${route.method} ${route.path}`;

const declarationsOfHandler = (
  controller: Type<unknown>,
  handler: Handler,
  prefix: string,
  reflector: Reflector,
): RouteDeclaration[] => {
  const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
  if (method === undefined) return [];
  const targets = [handler, controller];
  const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true;
  const roles = reflector.getAllAndOverride<readonly Role[] | undefined>(ROLES_KEY, targets) ?? [];

  return pathsOf(controller).flatMap((controllerPath) =>
    pathsOf(handler).map((handlerPath) => ({
      method: RequestMethod[method],
      path: joinPath(prefix, controllerPath, handlerPath),
      public: isPublic,
      roles,
    })),
  );
};

/**
 * Recorre los controladores de la app (o de un módulo de prueba compilado) y devuelve, por ruta, lo que declara
 * para `JwtAuthGuard` y `RolesGuard`. Lee los metadatos con las mismas claves y la misma precedencia que los guards
 * (`getAllAndOverride` sobre método y clase: el método manda). `prefix` es el prefijo global de `configureHttpApp`,
 * que Nest no expone desde la app.
 */
export const listRouteDeclarations = (
  app: INestApplicationContext,
  prefix: string,
): RouteDeclaration[] => {
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const reflector = new Reflector();

  return discovery.getControllers().flatMap(({ metatype }) => {
    if (metatype === null) return [];
    const controller = metatype as Type<unknown>;
    const prototype = controller.prototype as Record<string, Handler>;
    return scanner
      .getAllMethodNames(prototype)
      .flatMap((name) =>
        declarationsOfHandler(controller, prototype[name] as Handler, prefix, reflector),
      );
  });
};

/** Las rutas sin `@Public()` ni `@Roles(...)` y las que declaran las dos cosas (DT-2, CA-7). */
export const routeDeclarationProblems = (
  routes: readonly RouteDeclaration[],
): RouteDeclarationProblems => ({
  undeclared: routes
    .filter((route) => !route.public && route.roles.length === 0)
    .map(describeRoute),
  declaresBoth: routes.filter((route) => route.public && route.roles.length > 0).map(describeRoute),
});
