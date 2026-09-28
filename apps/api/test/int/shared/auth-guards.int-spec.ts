import { Injectable, Module } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  MiddlewareConsumer,
  NestInterceptor,
  NestMiddleware,
  NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { errorResponseSchema } from '@nimbo/contracts';
import type { NextFunction, Request, Response } from 'express';
import type { Observable } from 'rxjs';
import request from 'supertest';

import { ALL_ROLES, createActor, I_CLOCK, Role } from '../../../src/shared';
import type { FixedClock } from '../../../src/shared';
import { ProbeCalls, ProbeController } from '../../support/probe.controller';
import { DEFAULT_TEST_CLAIMS, TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const USER_ID = '2b4d6f8a-0c1e-4a3b-8d5f-7a9c1e3b5d7f';
const SPOOFED_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
/** Lo que un middleware o interceptor malicioso deja en `req.user`: nadie debe leerlo. */
const SPOOFED_USER = {
  id: SPOOFED_ID,
  userId: SPOOFED_ID,
  role: Role.ADMIN,
  sessionId: SPOOFED_ID,
  canReadContent: true,
};

@Injectable()
class SpoofUserMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    Object.assign(req, { user: SPOOFED_USER });
    next();
  }
}

@Injectable()
class SpoofUserInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    Object.assign(ctx.switchToHttp().getRequest<Request>(), { user: SPOOFED_USER });
    return next.handle();
  }
}

/** Escribe `req.user` **antes** (middleware) y **después** (interceptor) de los guards (003 §11.5 cambio 5). */
@Module({ providers: [{ provide: APP_INTERCEPTOR, useClass: SpoofUserInterceptor }] })
class SpoofingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SpoofUserMiddleware).forRoutes(ProbeController);
  }
}

describe('Guards globales por HTTP (003 CA-1, CA-4, CA-5, CA-6)', () => {
  let testApp: TestApp | undefined;
  let tokens: TestAccessTokens;

  beforeAll(async () => {
    testApp = await createTestApp({ modules: [SpoofingModule] });
    tokens = new TestAccessTokens(testApp.app.get<FixedClock>(I_CLOCK));
  });

  afterAll(async () => {
    await testApp?.close();
  });

  const current = (): TestApp => {
    if (testApp === undefined) throw new Error('arnés no inicializado');
    return testApp;
  };
  const server = (): Parameters<typeof request>[0] => current().app.getHttpServer();
  const calls = (): ProbeCalls => current().app.get(ProbeCalls);
  const bearer = (role: Role): string => `Bearer ${tokens.forRole(role, USER_ID)}`;

  beforeEach(() => {
    calls().clear();
  });

  describe('CA-1: negación por defecto', () => {
    it.each(['undeclared', 'client'])(
      'CA-1: `/__probe/%s` sin token → 401 `SHARED_UNAUTHENTICATED` y el controlador no se ejecuta',
      async (handler) => {
        const response = await request(server()).get(`/api/v1/__probe/${handler}`);

        expect(response.status).toBe(401);
        expect(errorResponseSchema.parse(response.body)).toMatchObject({
          code: 'SHARED_UNAUTHENTICATED',
        });
        expect(calls().count(handler)).toBe(0);
      },
    );
  });

  describe('CA-4: el `Actor` sale del token', () => {
    it.each(ALL_ROLES)(
      'CA-4: con un token de %s llega `{ id, role, canReadContent }`',
      async (role) => {
        const response = await request(server())
          .get('/api/v1/__probe/actor')
          .set('Authorization', bearer(role));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ id: USER_ID, role, canReadContent: role === Role.CLIENT });
      },
    );

    it('CA-4: otro `id`, `userId`, `role` o `actor` en la ruta, la consulta y las cabeceras no cambia el `Actor`', async () => {
      const response = await request(server())
        .get(`/api/v1/__probe/actor/${SPOOFED_ID}`)
        .query({ id: SPOOFED_ID, userId: SPOOFED_ID, role: Role.ADMIN, actor: SPOOFED_ID })
        .set('Authorization', bearer(Role.OPERATOR))
        .set('x-user-id', SPOOFED_ID)
        .set('x-actor-role', Role.ADMIN)
        .set('x-forwarded-user', SPOOFED_ID);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createActor(USER_ID, Role.OPERATOR));
    });

    it('CA-4: otro `id`, `userId`, `role` o `actor` en el cuerpo no cambia el `Actor`', async () => {
      const response = await request(server())
        .post('/api/v1/__probe/actor')
        .set('Authorization', bearer(Role.SUPPORT))
        .send({ id: SPOOFED_ID, userId: SPOOFED_ID, role: Role.ADMIN, actor: SPOOFED_USER });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createActor(USER_ID, Role.SUPPORT));
    });

    it('CA-4: `req.user` escrito antes y después del guard no cambia el `sessionId` de `@CurrentSessionId()`', async () => {
      const response = await request(server())
        .get('/api/v1/__probe/session')
        .set('Authorization', bearer(Role.CLIENT));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ sessionId: DEFAULT_TEST_CLAIMS.sessionId });
    });
  });
});
