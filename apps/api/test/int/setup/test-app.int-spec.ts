import { Injectable, Module } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import request from 'supertest';

import { ACCESS_TOKEN_STRATEGY } from '../../../src/shared';

import { createTestApp } from './test-app';
import type { TestApp } from './test-app';

/** Otra estrategia con el mismo nombre, como la `JwtStrategy` que `IdentityModule` registra desde 002. */
@Injectable()
class OtherAccessTokenStrategy extends PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY) {
  constructor() {
    super({
      jwtFromRequest: (): null => null,
      secretOrKey: 'otra-estrategia-solo-para-esta-prueba',
    });
  }

  validate(): false {
    return false;
  }
}

@Module({ providers: [OtherAccessTokenStrategy] })
class OtherStrategyModule {}

describe('createTestApp (003 T-13)', () => {
  let testApp: TestApp | undefined;

  afterEach(async () => {
    await testApp?.close();
    testApp = undefined;
  });

  it('CA-1: sin opciones, los guards globales están activos: una ruta protegida sin token → 401', async () => {
    testApp = await createTestApp();

    const response = await request(testApp.app.getHttpServer()).get('/api/v1/__probe/client');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
  });

  it('CA-1: `accessTokenStrategy: "test"` (por defecto) monta las sondas', async () => {
    testApp = await createTestApp();

    const response = await request(testApp.app.getHttpServer()).get('/api/v1/__probe/public');

    expect(response.status).toBe(200);
  });

  it('CA-1: `accessTokenStrategy: "identity"` no monta las sondas ni la estrategia de prueba', async () => {
    testApp = await createTestApp({ accessTokenStrategy: 'identity' });

    const response = await request(testApp.app.getHttpServer()).get('/api/v1/__probe/public');

    expect(response.status).toBe(404);
  });

  it('CA-1: pedir la estrategia de prueba con un árbol que ya registra otra `ACCESS_TOKEN_STRATEGY` lanza', async () => {
    await expect(createTestApp({ modules: [OtherStrategyModule] })).rejects.toThrow(
      /una sola estrategia/,
    );
  });
});
