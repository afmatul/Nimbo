import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { I_CLOCK, Role } from '../../../src/shared';
import type { FixedClock } from '../../../src/shared';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { LogLine } from '../setup/log-sink';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

const USER_ID = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const FIXTURE_EMAIL = 'ana.lopez@example.com';
const SPOOFED_HEADERS = {
  'x-user-id': 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  'x-actor-role': 'ADMIN-FALSO',
  'x-forwarded-user': FIXTURE_EMAIL,
} as const;
const ACTOR_ROUTE = 'GET /api/v1/__probe/actor/:id';
const DENIAL_EVENTS = new Set(['auth.unauthenticated', 'auth.forbidden', 'http.domain_error']);

interface Sent {
  readonly correlationId: string;
  readonly authorization: string | undefined;
}

/**
 * CA-16 (003 §7): cada 401 y 403 deja una bitácora con `correlationId`, la ruta como **patrón**, el motivo y, en 403,
 * el actor; ninguna línea lleva el token ni `Bearer`, y las de la denegación tampoco el correo ni las cabeceras falsas.
 */
describe('Bitácoras de 401 y 403 (003 CA-16)', () => {
  let testApp: TestApp | undefined;
  let tokens: TestAccessTokens;

  beforeAll(async () => {
    testApp = await createTestApp();
    tokens = new TestAccessTokens(testApp.app.get<FixedClock>(I_CLOCK));
  });

  afterAll(async () => {
    await testApp?.close();
  });

  const current = (): TestApp => {
    if (testApp === undefined) throw new Error('arnés no inicializado');
    return testApp;
  };

  /** Llama la sonda con un `id` real y una consulta: la bitácora debe registrar solo el patrón. */
  const call = async (path: string, authorization?: string): Promise<Sent> => {
    const correlationId = randomUUID();
    let pending = request(current().app.getHttpServer())
      .get(`/api/v1/__probe/${path}`)
      .query({ x: '1', email: FIXTURE_EMAIL })
      .set('x-correlation-id', correlationId)
      .set(SPOOFED_HEADERS);
    if (authorization !== undefined) pending = pending.set('Authorization', authorization);
    await pending;
    return { correlationId, authorization };
  };

  const linesOf = (sent: Sent): LogLine[] => current().logs.withCorrelationId(sent.correlationId);
  const eventOf = (sent: Sent, event: string): LogLine[] =>
    linesOf(sent).filter((line) => line.event === event);

  const expectNothingSensitive = (sent: Sent): void => {
    const all = linesOf(sent).map((line) => JSON.stringify(line));
    const denials = linesOf(sent)
      .filter((line) => DENIAL_EVENTS.has(String(line.event)))
      .map((line) => JSON.stringify(line));
    const token = sent.authorization?.replace(/^\S+\s*/, '');
    for (const line of all) {
      expect(line).not.toContain('Bearer');
      if (token) expect(line).not.toContain(token);
    }
    for (const line of denials) {
      expect(line).not.toContain(FIXTURE_EMAIL);
      for (const value of Object.values(SPOOFED_HEADERS)) expect(line).not.toContain(value);
      expect(line).not.toContain('?');
    }
  };

  it.each([
    ['missing_token', (): string | undefined => undefined],
    ['malformed_authorization', (): string => `Basic ${tokens.valid()}`],
    ['invalid_token', (): string => `Bearer ${tokens.tampered()}`],
    ['expired_token', (): string => `Bearer ${tokens.expired()}`],
  ])('CA-16: 401 `%s` con `correlationId`, ruta como patrón y motivo', async (reason, header) => {
    const sent = await call(`actor/${randomUUID()}`, header());

    expect(eventOf(sent, 'auth.unauthenticated')).toEqual([
      expect.objectContaining({ correlationId: sent.correlationId, route: ACTOR_ROUTE, reason }),
    ]);
    expectNothingSensitive(sent);
  });

  it.each([
    ['role_not_allowed', 'admin', 'GET /api/v1/__probe/admin', [Role.ADMIN]],
    ['undeclared_route', 'undeclared', 'GET /api/v1/__probe/undeclared', []],
  ])(
    'CA-16: 403 `%s` con `correlationId`, ruta, `actorId`, `role` y roles requeridos',
    async (reason, path, route, requiredRoles) => {
      const sent = await call(path, `Bearer ${tokens.forRole(Role.CLIENT, USER_ID)}`);

      expect(eventOf(sent, 'auth.forbidden')).toEqual([
        expect.objectContaining({
          correlationId: sent.correlationId,
          route,
          actorId: USER_ID,
          role: Role.CLIENT,
          reason,
          requiredRoles,
        }),
      ]);
      expectNothingSensitive(sent);
    },
  );

  it('CA-16: `http.domain_error` registra `code` y `status`, sin repetir el motivo', async () => {
    const sent = await call('client');

    const [domainError] = eventOf(sent, 'http.domain_error');
    expect(domainError).toMatchObject({ code: 'SHARED_UNAUTHENTICATED', status: 401 });
    expect(domainError).not.toHaveProperty('reason');
  });
});
