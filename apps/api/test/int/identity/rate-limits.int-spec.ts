import { randomUUID } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  errorResponseSchema,
  REGISTRATIONS_PER_IP_PER_HOUR,
  RESENDS_PER_IP_PER_HOUR,
  verifyEmailResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import { deleteAll, waitForMessages } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
/** Un momento dentro de la espera de 60 s entre solicitudes del mismo correo (D-8). */
const WITHIN_COOLDOWN_SECONDS = 30;
/** IPs de documentación (RFC 5737) que llegan por `X-Forwarded-For` a través del proxy de confianza. */
const CROWDED_IP = '198.51.100.7';
const OTHER_IP = '198.51.100.8';
const CROWDED_RESEND_IP = '198.51.100.9';

/** Mensaje de CA-15 para una espera de `retryAfterSeconds` (minutos redondeados hacia arriba). */
const tooManyRequestsMessage = (retryAfterSeconds: number): string => {
  const minutes = Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE);
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return (
    'Ya te enviamos un enlace hace poco. Revisa tu bandeja y la carpeta de spam, o inténtalo de nuevo en ' +
    `${String(minutes)} ${unit}.`
  );
};

/**
 * Límites de CA-15 (D-8) de punta a punta: por correo (60 s y 5 por hora, registro y reenvío juntos, con el
 * `FixedClock` que controla `RedisRateLimiter`) y por IP (10 registros y 10 reenvíos por hora, cada ruta con su
 * contador, `IdentityIpThrottlerGuard`).
 */
describe('Límites de registro y reenvío (CA-15)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  const register = (email: string, fullName = 'Lucía Pérez'): request.Test =>
    request(server())
      .post(REGISTER)
      .send({ ...validRegistration(email), fullName });

  const resend = (email: string): request.Test => request(server()).post(RESEND).send({ email });

  const verify = (token: string): request.Test =>
    request(server()).post(VERIFY_EMAIL).send({ token });

  const registerAndReadLink = async (email: string): Promise<string> => {
    await register(email).expect(202);
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return token;
  };

  /** Estado persistido de la cuenta: la fila de `usuario` y sus tokens. */
  const accountState = async (email: string): Promise<unknown> => {
    const users = (await dataSource.query('SELECT * FROM usuario WHERE correo = $1', [email])) as {
      id: string;
    }[];
    const tokens: unknown = await dataSource.query(
      'SELECT * FROM token_cuenta WHERE usuario_id = $1 ORDER BY creado_en',
      [users[0]?.id ?? randomUUID()],
    );
    return { users, tokens };
  };

  /** 429 de CA-15 con su `Retry-After`, su mensaje y sin correo encolado por esa petición. */
  const expectTooManyRequests = (response: request.Response, retryAfterSeconds: number): void => {
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe(String(retryAfterSeconds));
    const body = errorResponseSchema.parse(response.body);
    expect(body).toEqual({
      code: 'IDENTITY_TOO_MANY_REQUESTS',
      message: tooManyRequestsMessage(retryAfterSeconds),
      correlationId: body.correlationId,
    });
    expect(
      testApp.logs
        .withCorrelationId(body.correlationId)
        .filter((line) => line.event === 'mail.enqueued'),
    ).toEqual([]);
  };

  /** CA-13 tras el límite: llega un enlace nuevo, el anterior da `LINK_INVALID` y el nuevo verifica. */
  const expectResendWorks = async (email: string, previousToken: string): Promise<void> => {
    await resend(email).expect(202);
    const latest = await verificationTokenSentTo(email);
    const rejected = await verify(previousToken);
    expect(errorResponseSchema.parse(rejected.body).code).toBe(
      'IDENTITY_VERIFICATION_LINK_INVALID',
    );
    const verified = await verify(latest);
    expect(verifyEmailResponseSchema.parse(verified.body)).toMatchObject({ status: 'verified' });
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
  });

  it('CA-15: antes de 60 s, reenvío y registro del mismo correo dan 429 sin correo ni cambios; las rechazadas no cuentan y al cumplirse el tiempo funciona como CA-13', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    const before = await accountState(email);
    clock.advance(WITHIN_COOLDOWN_SECONDS * MS_PER_SECOND);
    const remaining = EMAIL_REQUEST_COOLDOWN_SECONDS - WITHIN_COOLDOWN_SECONDS;

    expectTooManyRequests(await resend(email), remaining);
    expectTooManyRequests(await register(email, 'Ana Dos'), remaining);

    expect(await accountState(email)).toEqual(before);
    clock.advance(remaining * MS_PER_SECOND);
    await expectResendWorks(email, token);
  });

  it('CA-15: la sexta solicitud del mismo correo en una hora da 429 con los minutos que faltan y, al cumplirse, la siguiente funciona como CA-13', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    for (let sent = 1; sent < EMAIL_REQUESTS_PER_HOUR; sent += 1) {
      clock.advance(EMAIL_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND);
      await resend(email).expect(202);
    }
    await waitForMessages(EMAIL_REQUESTS_PER_HOUR - 1);
    await deleteAll();
    const before = await accountState(email);
    clock.advance(EMAIL_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND);
    const retryAfterSeconds =
      SECONDS_PER_HOUR - EMAIL_REQUESTS_PER_HOUR * EMAIL_REQUEST_COOLDOWN_SECONDS;

    expectTooManyRequests(await resend(email), retryAfterSeconds);

    expect(await accountState(email)).toEqual(before);
    clock.advance(retryAfterSeconds * MS_PER_SECOND);
    await expectResendWorks(email, token);
  });

  it('CA-15: el registro siguiente a los 10 de una misma IP en una hora da 429 sin crear la cuenta; otra IP sigue registrando', async () => {
    const fromCrowdedIp = (email: string): request.Test =>
      register(email).set('X-Forwarded-For', CROWDED_IP);
    for (let registration = 0; registration < REGISTRATIONS_PER_IP_PER_HOUR; registration += 1) {
      await fromCrowdedIp(`ip-${randomUUID()}@ejemplo.com`).expect(202);
    }
    const rejectedEmail = `ip-${randomUUID()}@ejemplo.com`;

    const response = await fromCrowdedIp(rejectedEmail);

    const retryAfterSeconds = Number(response.headers['retry-after']);
    expect(Number.isInteger(retryAfterSeconds)).toBe(true);
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(SECONDS_PER_HOUR);
    expectTooManyRequests(response, retryAfterSeconds);
    expect(await accountState(rejectedEmail)).toEqual({ users: [], tokens: [] });
    await register(`otra-ip-${randomUUID()}@ejemplo.com`)
      .set('X-Forwarded-For', OTHER_IP)
      .expect(202);
    await waitForMessages(REGISTRATIONS_PER_IP_PER_HOUR + 1);
  });

  it('CA-15: el reenvío siguiente a los 10 de una misma IP en una hora da 429 sin correo ni cambios; esa IP sigue registrando y otra IP sigue reenviando', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    await registerAndReadLink(email);
    const before = await accountState(email);
    const fromCrowdedIp = (address: string): request.Test =>
      resend(address).set('X-Forwarded-For', CROWDED_RESEND_IP);
    for (let sent = 0; sent < RESENDS_PER_IP_PER_HOUR; sent += 1) {
      await fromCrowdedIp(`sin-cuenta-${randomUUID()}@ejemplo.com`).expect(202);
    }

    const response = await fromCrowdedIp(email);

    const retryAfterSeconds = Number(response.headers['retry-after']);
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(SECONDS_PER_HOUR);
    expectTooManyRequests(response, retryAfterSeconds);
    expect(await accountState(email)).toEqual(before);
    await register(`misma-ip-${randomUUID()}@ejemplo.com`)
      .set('X-Forwarded-For', CROWDED_RESEND_IP)
      .expect(202);
    clock.advance(EMAIL_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND);
    await resend(email).set('X-Forwarded-For', OTHER_IP).expect(202);
    await waitForMessages(2);
  });
});
