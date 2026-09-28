import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Logger } from 'nestjs-pino';

import { UnauthenticatedError } from '../../domain/errors';
import { Role } from '../../domain/role.enum';

import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';

const ROUTE_PATH = '/api/v1/__probe/actor/:id';
const WELL_FORMED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJh';

class ProbeController {
  @Public()
  publicHandler(): void {
    return undefined;
  }

  @Roles(Role.CLIENT)
  protectedHandler(): void {
    return undefined;
  }
}

interface FakeRequest {
  readonly method: string;
  readonly baseUrl: string;
  readonly route: { readonly path: string };
  readonly headers: Record<string, string>;
  readonly rawHeaders: readonly string[];
}

/** Petición con las cabeceras `authorization` dadas, tal como las deja Node en `rawHeaders`. */
const requestWith = (...authorization: readonly string[]): FakeRequest => {
  const [first] = authorization;
  return {
    method: 'GET',
    baseUrl: '',
    route: { path: ROUTE_PATH },
    headers: first === undefined ? {} : { authorization: first },
    rawHeaders: authorization.flatMap((value) => ['Authorization', value]),
  };
};

/** Petición que falla ante cualquier lectura: prueba que una ruta pública no mira la cabecera. */
const untouchableRequest = (): object =>
  new Proxy(
    {},
    {
      get: (): never => {
        throw new Error('la ruta pública no debe leer la petición');
      },
    },
  );

const contextFor = (
  request: object,
  handler: keyof ProbeController = 'protectedHandler',
): ExecutionContext =>
  ({
    getHandler: () => ProbeController.prototype[handler],
    getClass: () => ProbeController,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  }) as unknown as ExecutionContext;

const fakeLogger = (): Logger => ({ log: jest.fn(), warn: jest.fn() }) as unknown as Logger;

/** `canActivate` de `AuthGuard(ACCESS_TOKEN_STRATEGY)`, es decir, la llamada a Passport. */
const passportCanActivate = (): jest.SpyInstance =>
  jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as JwtAuthGuard, 'canActivate');

describe('JwtAuthGuard.canActivate', () => {
  const newGuard = (): JwtAuthGuard => new JwtAuthGuard(new Reflector(), fakeLogger());

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-1: una ruta @Public() pasa sin llamar a Passport ni leer la petición', async () => {
    const passport = passportCanActivate();

    await expect(
      newGuard().canActivate(contextFor(untouchableRequest(), 'publicHandler')),
    ).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
  });

  it('CA-1: una ruta @Public() ignora un token inválido', async () => {
    const passport = passportCanActivate();

    await expect(
      newGuard().canActivate(contextFor(requestWith('Bearer basura'), 'publicHandler')),
    ).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
  });

  it('CA-1: sin cabecera `authorization` rechaza con `UnauthenticatedError` sin llamar a Passport', async () => {
    const passport = passportCanActivate();

    await expect(newGuard().canActivate(contextFor(requestWith()))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(passport).not.toHaveBeenCalled();
  });

  it.each([
    ['otro esquema', ['Basic dXNlcjpwYXNz']],
    ['`Bearer` vacío', ['Bearer ']],
    ['`Bearer` sin espacio ni token', ['Bearer']],
    ['espacios de más entre esquema y token', [`Bearer  ${WELL_FORMED_TOKEN}`]],
    ['espacio al final', [`Bearer ${WELL_FORMED_TOKEN} `]],
    ['esquema en minúsculas', [`bearer ${WELL_FORMED_TOKEN}`]],
    [
      'dos cabeceras `authorization`',
      [`Bearer ${WELL_FORMED_TOKEN}`, `Bearer ${WELL_FORMED_TOKEN}`],
    ],
  ])(
    'CA-1: cabecera mal formada (%s) rechaza sin llamar a Passport',
    async (_case, values: readonly string[]) => {
      const passport = passportCanActivate();

      await expect(
        newGuard().canActivate(contextFor(requestWith(...values))),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(passport).not.toHaveBeenCalled();
    },
  );

  it('CA-1: con un `Bearer` bien formado delega en Passport', async () => {
    const passport = passportCanActivate().mockResolvedValue(true);

    await expect(
      newGuard().canActivate(contextFor(requestWith(`Bearer ${WELL_FORMED_TOKEN}`))),
    ).resolves.toBe(true);
    expect(passport).toHaveBeenCalledTimes(1);
  });

  it('CA-1: si Passport falla fuera del *callback* (estrategia desconocida), el error pasa por `handleRequest`', async () => {
    const guard = newGuard();
    const unknownStrategy = new Error('Unknown authentication strategy "jwt"');
    passportCanActivate().mockRejectedValue(unknownStrategy);
    const handleRequest = jest.spyOn(guard, 'handleRequest');
    const ctx = contextFor(requestWith(`Bearer ${WELL_FORMED_TOKEN}`));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(Error);
    expect(handleRequest).toHaveBeenCalledWith(unknownStrategy, false, undefined, ctx);
  });

  it('CA-1: sin estrategia registrada en Passport, una ruta protegida nunca pasa', async () => {
    await expect(
      newGuard().canActivate(contextFor(requestWith(`Bearer ${WELL_FORMED_TOKEN}`))),
    ).rejects.toBeInstanceOf(Error);
  });
});
