import { randomBytes, randomUUID } from 'node:crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  errorResponseSchema,
  VERIFICATION_LINK_TTL_HOURS,
  verifyEmailResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CLIENT_ACCOUNT_VERIFIED } from '../../../src/modules/identity';
import type { ClientAccountVerifiedEvent } from '../../../src/modules/identity';
import { FixedClock, I_CLOCK } from '../../../src/shared';
import { deleteAll } from '../setup/mailpit';
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
const LINK_TTL_MS = VERIFICATION_LINK_TTL_HOURS * 3600 * MS_PER_SECOND;
/** Lo justo para salir de la espera entre solicitudes del mismo correo (D-8) y pedir otro enlace. */
const PAST_COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * MS_PER_SECOND;
/** Aperturas repetidas del mismo enlace en CA-10. */
const REPEATED_OPENINGS = 3;
/** Bytes y largo de un token bien formado (base64url sin relleno, plan §6.2). */
const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;

interface UserRow {
  id: string;
  correo_verificado: boolean;
}

interface TokenRow {
  usado_en: Date | null;
  invalidado_en: Date | null;
}

/**
 * `POST /auth/verify-email` de punta a punta (plan §5): T-45 dejó el camino feliz de CA-8; T-48 completa CA-8 a
 * CA-11. El reloj es un `FixedClock` que solo avanza cuando la prueba lo pide (CA-9) y un oyente de prueba captura
 * el evento de cuenta verificada (ADR-0019).
 */
describe('POST /auth/verify-email (CA-8 a CA-11)', () => {
  const clock = new FixedClock(new Date());
  const events: ClientAccountVerifiedEvent[] = [];
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  /** Registra `email` y devuelve el token del enlace que llegó a Mailpit; deja la bandeja vacía. */
  const registerAndReadLink = async (email: string): Promise<string> => {
    await request(server()).post(REGISTER).send(validRegistration(email)).expect(202);
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return token;
  };

  /** Pasada la espera de 60 s, pide otro enlace y devuelve su token; deja la bandeja vacía. */
  const resendAndReadLink = async (email: string): Promise<string> => {
    clock.advance(PAST_COOLDOWN_MS);
    await request(server()).post(RESEND).send({ email }).expect(202);
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return token;
  };

  const verify = (token: string): request.Test =>
    request(server()).post(VERIFY_EMAIL).send({ token });

  const userByEmail = async (email: string): Promise<UserRow> => {
    const [user] = (await dataSource.query(
      'SELECT id, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as UserRow[];
    if (user === undefined) throw new Error('La cuenta de la prueba no existe.');
    return user;
  };

  const tokensOf = (userId: string): Promise<TokenRow[]> =>
    dataSource.query(
      `SELECT usado_en, invalidado_en FROM token_cuenta
        WHERE usuario_id = $1 AND tipo = 'verificacion' ORDER BY creado_en`,
      [userId],
    ) as Promise<TokenRow[]>;

  const expectLinkInvalid = (response: request.Response, email: string, userId: string): void => {
    expect(response.status).toBe(422);
    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('IDENTITY_VERIFICATION_LINK_INVALID');
    expect(body.message).toBe(
      'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
    );
    expect(Object.keys(response.body as object).sort()).toEqual([
      'code',
      'correlationId',
      'message',
    ]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(email);
    expect(serialized).not.toContain(userId);
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    testApp.app
      .get(EventEmitter2)
      .on(CLIENT_ACCOUNT_VERIFIED, (event: ClientAccountVerifiedEvent) => {
        events.push(event);
      });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
    events.length = 0;
  });

  it('CA-8: el enlace más reciente verifica la cuenta, lo marca usado, cierra los demás y publica un solo evento `{ userId, pendingPlanSlug }`', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    await registerAndReadLink(email);
    const latest = await resendAndReadLink(email);

    const response = await verify(latest);

    expect(response.status).toBe(200);
    expect(verifyEmailResponseSchema.parse(response.body)).toMatchObject({ status: 'verified' });
    expect(response.headers['cache-control']).toBe('no-store');
    const user = await userByEmail(email);
    expect(user.correo_verificado).toBe(true);
    const tokens = await tokensOf(user.id);
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((token) => token.usado_en !== null)).toEqual([
      { usado_en: clock.now(), invalidado_en: null },
    ]);
    expect(tokens.every((token) => token.usado_en !== null || token.invalidado_en !== null)).toBe(
      true,
    );
    expect(events).toEqual([{ userId: user.id, pendingPlanSlug: null }]);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({ event: 'identity.account_verified.published', userId: user.id }),
    );
  });

  it('CA-9: un enlace abierto 24 h + 1 s después de emitido responde `LINK_EXPIRED`, la cuenta sigue sin verificar y no hay evento', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    clock.advance(LINK_TTL_MS + MS_PER_SECOND);

    const response = await verify(token);

    expect(response.status).toBe(422);
    const body = errorResponseSchema.parse(response.body);
    expect(body.code).toBe('IDENTITY_VERIFICATION_LINK_EXPIRED');
    expect(body.message).toBe(
      'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
    );
    const user = await userByEmail(email);
    expect(user.correo_verificado).toBe(false);
    expect(await tokensOf(user.id)).toEqual([{ usado_en: null, invalidado_en: null }]);
    expect(events).toEqual([]);
  });

  it('CA-10: repetir N veces el enlace que ya verificó responde `already-verified`, sin cambios ni evento nuevo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    await verify(token).expect(200);
    const user = await userByEmail(email);
    const tokensAfterVerification = await tokensOf(user.id);

    for (let opening = 0; opening < REPEATED_OPENINGS; opening += 1) {
      clock.advance(MS_PER_SECOND);
      const response = await verify(token);
      expect(response.status).toBe(200);
      expect(verifyEmailResponseSchema.parse(response.body)).toEqual({
        status: 'already-verified',
      });
    }

    expect(await userByEmail(email)).toEqual(user);
    expect(await tokensOf(user.id)).toEqual(tokensAfterVerification);
    expect(events).toEqual([{ userId: user.id, pendingPlanSlug: null }]);
  });

  it('CA-10: el enlace anterior de una cuenta que ya se verificó con otro responde `already-verified`, sin evento nuevo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const previous = await registerAndReadLink(email);
    const latest = await resendAndReadLink(email);
    await verify(latest).expect(200);
    const user = await userByEmail(email);
    const tokensAfterVerification = await tokensOf(user.id);

    const response = await verify(previous);

    expect(response.status).toBe(200);
    expect(verifyEmailResponseSchema.parse(response.body)).toEqual({ status: 'already-verified' });
    expect(await tokensOf(user.id)).toEqual(tokensAfterVerification);
    expect(events).toEqual([{ userId: user.id, pendingPlanSlug: null }]);
  });

  it('CA-11 (a): el enlace reemplazado de una cuenta no verificada responde `LINK_INVALID` sin datos de la cuenta y el vigente sigue sirviendo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const replaced = await registerAndReadLink(email);
    await resendAndReadLink(email);
    const user = await userByEmail(email);
    const tokensBefore = await tokensOf(user.id);

    const response = await verify(replaced);

    expectLinkInvalid(response, email, user.id);
    expect(await userByEmail(email)).toEqual(user);
    expect(await tokensOf(user.id)).toEqual(tokensBefore);
    expect(tokensBefore.at(-1)).toEqual({ usado_en: null, invalidado_en: null });
    expect(events).toEqual([]);
  });

  it('CA-11 (b): un token inexistente, alterado en un carácter, vacío o con formato incorrecto responde `LINK_INVALID` y ninguna cuenta cambia', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    const user = await userByEmail(email);
    const tokensBefore = await tokensOf(user.id);
    const altered = `${token.startsWith('A') ? 'B' : 'A'}${token.slice(1)}`;
    const candidates = [
      randomBytes(TOKEN_BYTES).toString('base64url'),
      altered,
      '',
      'no-es-un-token',
      `${token}A`,
      `${token.slice(0, TOKEN_LENGTH - 1)}+`,
    ];

    for (const candidate of candidates) {
      expectLinkInvalid(await verify(candidate), email, user.id);
    }

    expect(await userByEmail(email)).toEqual(user);
    expect(await tokensOf(user.id)).toEqual(tokensBefore);
    expect(events).toEqual([]);
  });
});
