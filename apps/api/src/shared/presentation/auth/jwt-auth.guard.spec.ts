import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Logger } from 'nestjs-pino';

import type { AccessTokenClaims } from '../../application/auth/i-access-token-verifier.port';
import { createActor } from '../../domain/actor';
import { UnauthenticatedError } from '../../domain/errors';
import { Role } from '../../domain/role.enum';

import { JwtAuthGuard, UNEXPECTED_ERROR_MESSAGE_MAX } from './jwt-auth.guard';
import { Public } from './public.decorator';
import { RequestPrincipal } from './request-principal';
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

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(handleRequest).toHaveBeenCalledWith(unknownStrategy, false, undefined, ctx);
  });

  it('CA-1: sin estrategia registrada en Passport, una ruta protegida nunca pasa', async () => {
    await expect(
      newGuard().canActivate(contextFor(requestWith(`Bearer ${WELL_FORMED_TOKEN}`))),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe('JwtAuthGuard.handleRequest', () => {
  const CLAIMS: AccessTokenClaims = {
    userId: '7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    role: Role.SUPPORT,
    sessionId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  };
  const tokenExpired = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
  const signatureInvalid = Object.assign(new Error('invalid signature'), {
    name: 'JsonWebTokenError',
  });

  const setup = (): { guard: JwtAuthGuard; logger: Logger; request: FakeRequest } => {
    const logger = fakeLogger();
    return {
      guard: new JwtAuthGuard(new Reflector(), logger),
      logger,
      request: requestWith(`Bearer ${WELL_FORMED_TOKEN}`),
    };
  };

  it('CA-2: con *claims* válidos arma el `Actor` con `createActor` y lo guarda en `RequestPrincipal`', () => {
    const { guard, request } = setup();

    expect(guard.handleRequest(null, CLAIMS, undefined, contextFor(request))).toBe(CLAIMS);
    expect(RequestPrincipal.get(request)).toEqual({
      actor: createActor(CLAIMS.userId, CLAIMS.role),
      sessionId: CLAIMS.sessionId,
    });
  });

  it.each([
    ['`info` es `TokenExpiredError`', null, false, tokenExpired],
    ['la estrategia informa `reason: "expired"`', null, false, { reason: 'expired' }],
  ])('CA-2: %s → 401 `expired_token`', (_case, err, user, info) => {
    const { guard, logger, request } = setup();

    expect(() => guard.handleRequest(err, user, info, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
    expect(logger.log).toHaveBeenCalledWith({
      event: 'auth.unauthenticated',
      route: `GET ${ROUTE_PATH}`,
      reason: 'expired_token',
    });
    expect(RequestPrincipal.get(request)).toBeUndefined();
  });

  it.each([
    ['firma inválida en `info`', null, false, signatureInvalid],
    ['la estrategia informa `reason: "invalid"`', null, false, { reason: 'invalid' }],
    ['`user === false` sin `info`', null, false, undefined],
    ['`err` no nulo', new Error('fallo inesperado'), false, undefined],
    [
      'estrategia desconocida',
      new Error('Unknown authentication strategy "jwt"'),
      false,
      undefined,
    ],
    ['`user` que no es un `AccessTokenClaims`', null, { userId: 'x', role: 'ROOT' }, undefined],
  ])('CA-2: %s → 401 `invalid_token` (nunca 500)', (_case, err, user, info) => {
    const { guard, logger, request } = setup();

    expect(() => guard.handleRequest(err, user, info, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
    expect(logger.log).toHaveBeenCalledWith({
      event: 'auth.unauthenticated',
      route: `GET ${ROUTE_PATH}`,
      reason: 'invalid_token',
    });
  });

  it('CA-16: un `err` inesperado registra `auth.unexpected_error` con su clase y mensaje, sin la cabecera', () => {
    const { guard, logger, request } = setup();
    const bug = new TypeError("Cannot read properties of undefined (reading 'sub')");

    expect(() => guard.handleRequest(bug, false, undefined, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'auth.unexpected_error',
      route: `GET ${ROUTE_PATH}`,
      errorClass: 'TypeError',
      errorMessage: "Cannot read properties of undefined (reading 'sub')",
    });
    expect(JSON.stringify(jest.mocked(logger.warn).mock.calls)).not.toContain(WELL_FORMED_TOKEN);
    expect(logger.log).toHaveBeenCalledWith({
      event: 'auth.unauthenticated',
      route: `GET ${ROUTE_PATH}`,
      reason: 'invalid_token',
    });
  });

  it('CA-16: el mensaje de un `err` inesperado se recorta a 200 caracteres', () => {
    const { guard, logger, request } = setup();

    expect(() =>
      guard.handleRequest(new Error('x'.repeat(1000)), false, undefined, contextFor(request)),
    ).toThrow(UnauthenticatedError);
    const [[entry]] = jest.mocked(logger.warn).mock.calls as [[{ errorMessage: string }]];
    expect(entry.errorMessage).toHaveLength(UNEXPECTED_ERROR_MESSAGE_MAX);
  });

  it('CA-16: un valor no `Error` en `err` registra su tipo y ningún mensaje', () => {
    const { guard, logger, request } = setup();

    expect(() => guard.handleRequest('falló', false, undefined, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'auth.unexpected_error',
      route: `GET ${ROUTE_PATH}`,
      errorClass: 'string',
    });
  });

  it.each([
    ['`UnauthenticatedError`', new UnauthenticatedError()],
    ['`TokenExpiredError` de `jsonwebtoken`', tokenExpired],
    ['`JsonWebTokenError` de `jsonwebtoken`', signatureInvalid],
    [
      '`NotBeforeError` de `jsonwebtoken`',
      Object.assign(new Error('jwt not active'), { name: 'NotBeforeError' }),
    ],
  ])('CA-16: un `err` esperado (%s) no registra `auth.unexpected_error`', (_case, err) => {
    const { guard, logger, request } = setup();

    expect(() => guard.handleRequest(err, false, undefined, contextFor(request))).toThrow(
      UnauthenticatedError,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing_token', []],
    ['malformed_authorization', ['Basic dXNlcjpwYXNz']],
  ])(
    'CA-16: el rechazo por cabecera registra `%s` con el patrón de la ruta y sin la cabecera',
    async (reason, values: readonly string[]) => {
      const logger = fakeLogger();
      const guard = new JwtAuthGuard(new Reflector(), logger);

      await expect(guard.canActivate(contextFor(requestWith(...values)))).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith({
        event: 'auth.unauthenticated',
        route: `GET ${ROUTE_PATH}`,
        reason,
      });
    },
  );

  it('CA-16: un rechazo dentro de Passport se registra una sola vez', async () => {
    const { guard, logger, request } = setup();
    const ctx = contextFor(request);
    jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as JwtAuthGuard, 'canActivate')
      .mockImplementation(() => guard.handleRequest(null, false, signatureInvalid, ctx));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(logger.log).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});
