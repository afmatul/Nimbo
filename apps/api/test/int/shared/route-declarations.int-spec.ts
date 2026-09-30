import { SHARED_ERROR_CODES } from '@nimbo/contracts';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import {
  describeRoute,
  listRouteDeclarations,
  routeDeclarationProblems,
} from '../../support/route-declarations';
import type { RouteDeclaration } from '../../support/route-declarations';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

/** Prefijo global de `configureHttpApp` (Nest no lo expone desde la app). */
const API_PREFIX = 'api/v1';

/**
 * Lista cerrada de rutas públicas (CA-3). Las de 002-PR-3 (recuperación) y 006a (catálogo) se agregan con sus PR.
 */
const EXPECTED_PUBLIC_ROUTES = [
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/resend-verification',
  'POST /api/v1/auth/session/logout',
  'POST /api/v1/auth/session/refresh',
  'POST /api/v1/auth/verify-email',
];

/**
 * La API completa (`AppModule`, como `main.ts`) con los guards globales: recorre todas sus rutas (CA-7) y comprueba
 * la lista de públicas (CA-3). `accessTokenStrategy: 'identity'` porque la estrategia la aporta `AppModule` (002); sin
 * ella, lo no público responde 401.
 */
describe('declaración de rutas de la API completa (CA-3, CA-7)', () => {
  let testApp: TestApp;
  let routes: RouteDeclaration[];

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createTestApp({
      modules: [AppModule.forRoot(env)],
      validatedEnv: env,
      accessTokenStrategy: 'identity',
    });
    routes = listRouteDeclarations(testApp.app, API_PREFIX);
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('CA-7: toda ruta declara `@Public()` o `@Roles(...)`, y ninguna las dos', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routeDeclarationProblems(routes)).toEqual({ undeclared: [], declaresBoth: [] });
  });

  it('CA-3: las rutas `@Public()` son exactamente la lista explícita', () => {
    const publicRoutes = routes.filter((route) => route.public).map(describeRoute);

    expect([...publicRoutes].sort()).toEqual([...EXPECTED_PUBLIC_ROUTES].sort());
  });

  it('CA-3: `GET /api/v1/health/live` responde 200 sin token', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/api/v1/health/live');

    expect(response.status).toBe(200);
  });

  // Una ruta pública puede responder 401 por su cuenta (p. ej. `session/refresh` sin cookie, 002 CA-8); lo que CA-3
  // prohíbe es que la rechace el guard sin token.
  it.each(EXPECTED_PUBLIC_ROUTES)('CA-3: `%s` sin token no la rechaza el guard', async (route) => {
    const [method, path] = route.split(' ') as [string, string];

    const response = await request(testApp.app.getHttpServer())[
      method.toLowerCase() as 'get' | 'post'
    ](path);

    expect((response.body as { code?: string }).code).not.toBe(SHARED_ERROR_CODES.UNAUTHENTICATED);
  });
});
