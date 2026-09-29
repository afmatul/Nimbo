import { randomBytes, randomUUID } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  REGISTRATIONS_PER_IP_PER_HOUR,
  VERIFICATION_LINK_TTL_HOURS,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { LogLine } from '../setup/log-sink';
import { deleteAll, getMessage, listMessages } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp, validRegistration } from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const LINK_TOKEN = /\/verificar-correo#token=([A-Za-z0-9_-]{43})/;
const LINK_PATH = '/verificar-correo#token=';
const COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * 1000;
const LINK_TTL_MS = VERIFICATION_LINK_TTL_HOURS * 3_600_000;
const POLL_STEP_MS = 100;
const WAIT_MS = 30_000;

/** Contraseñas del flujo: la de CA-1, la que la reemplaza en CA-4 y una débil (sin mayúscula) para CA-5. */
const FIRST_PASSWORD = validRegistration('').password;
const SECOND_PASSWORD = 'Otra-Clave-Nimbo-2027';
const WEAK_PASSWORD = 'clave-debil-sin-mayuscula-7';
const FIRST_NAME = validRegistration('').fullName;
const SECOND_NAME = 'Ana Dos Bitácora';

const waitUntil = async <T>(probe: () => Promise<T | undefined>, what: string): Promise<T> => {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const found = await probe();
    if (found !== undefined) return found;
    if (Date.now() >= deadline) throw new Error(`No ocurrió a tiempo: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
  }
};

/** El primer token de un correo a `email` que no esté en `known` (varios correos llegan a la misma dirección). */
const newTokenSentTo = (email: string, known: ReadonlySet<string>): Promise<string> =>
  waitUntil(async () => {
    const messages = await listMessages();
    for (const summary of messages.filter((m) => m.To.some((to) => to.Address === email))) {
      const token = LINK_TOKEN.exec((await getMessage(summary.ID)).Text)?.[1];
      if (token !== undefined && !known.has(token)) return token;
    }
    return undefined;
  }, `enlace nuevo para la cuenta del flujo`);

/**
 * CA-18: bitácoras sin datos sensibles (D-18, RNF-17). Recorre en orden los flujos de CA-1, CA-5, CA-15, CA-4,
 * CA-11, CA-13, CA-9, CA-8, CA-10 y CA-2 sobre una misma cuenta con `FixedClock`, más el límite por IP de CA-15, con
 * `api` y `worker` en la misma app y un solo `LogSink`. Las pruebas inspeccionan las líneas resultantes.
 */
describe('bitácoras de identity (CA-18)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  const clock = new FixedClock(new Date());
  const email = `ana-${randomUUID()}@ejemplo.com`;
  const unknownToken = randomBytes(32).toString('base64url');
  const tokens = new Set<string>();
  const secrets = new Set<string>([
    FIRST_PASSWORD,
    SECOND_PASSWORD,
    WEAK_PASSWORD,
    FIRST_NAME,
    SECOND_NAME,
    email,
    email.split('@')[0] ?? email,
    unknownToken,
    LINK_PATH,
    '$argon2',
  ]);
  const ipEmails: string[] = [];
  const usedIps = new Set<string>();
  let userId = '';
  let registrationCorrelationId = '';
  let lines: LogLine[] = [];
  let nextIp = 0;

  const post = (
    path: string,
    body: object,
    ip = `198.51.100.${String((nextIp += 1))}`,
  ): Promise<Response> => {
    usedIps.add(ip);
    return request(testApp.app.getHttpServer()).post(path).set('X-Forwarded-For', ip).send(body);
  };

  const register = (
    fullName: string,
    password: string,
    to = email,
    ip?: string,
  ): Promise<Response> => post(REGISTER, { ...validRegistration(to), fullName, password }, ip);

  const nextToken = async (): Promise<string> => {
    const token = await newTokenSentTo(email, tokens);
    tokens.add(token);
    return token;
  };

  const expectStatus = (response: Response, status: number): void => {
    expect(response.status).toBe(status);
  };

  /** CA-1, CA-5 y CA-15 (por correo), luego CA-4 y CA-11 (a y b) con el enlace reemplazado y uno inexistente. */
  const runRegistrationFlows = async (): Promise<void> => {
    const accepted = await register(FIRST_NAME, FIRST_PASSWORD);
    expectStatus(accepted, 202);
    registrationCorrelationId = String(accepted.headers['x-correlation-id']);
    const firstToken = await nextToken();
    expectStatus(await register(FIRST_NAME, WEAK_PASSWORD), 422);
    expectStatus(await register(FIRST_NAME, FIRST_PASSWORD), 429);
    expectStatus(await post(RESEND, { email }), 429);
    clock.advance(COOLDOWN_MS);
    expectStatus(await register(SECOND_NAME, SECOND_PASSWORD), 202);
    await nextToken();
    expectStatus(await post(VERIFY_EMAIL, { token: firstToken }), 422);
    expectStatus(await post(VERIFY_EMAIL, { token: unknownToken }), 422);
  };

  /** CA-13, CA-9 (enlace vencido), CA-13 otra vez, CA-8 y CA-10. */
  const runVerificationFlows = async (): Promise<void> => {
    clock.advance(COOLDOWN_MS);
    expectStatus(await post(RESEND, { email }), 202);
    const expiring = await nextToken();
    clock.advance(LINK_TTL_MS + 1000);
    expectStatus(await post(VERIFY_EMAIL, { token: expiring }), 422);
    expectStatus(await post(RESEND, { email }), 202);
    const valid = await nextToken();
    expectStatus(await post(VERIFY_EMAIL, { token: valid }), 200);
    expectStatus(await post(VERIFY_EMAIL, { token: valid }), 200);
  };

  /** CA-2 (aviso y aviso suprimido) y el límite de CA-15 por IP. */
  const runExistingAccountAndIpFlows = async (): Promise<void> => {
    clock.advance(COOLDOWN_MS);
    expectStatus(await register(FIRST_NAME, FIRST_PASSWORD), 202);
    clock.advance(COOLDOWN_MS);
    expectStatus(await register(FIRST_NAME, FIRST_PASSWORD), 202);
    const sharedIp = '192.0.2.10';
    for (let index = 0; index <= REGISTRATIONS_PER_IP_PER_HOUR; index += 1) {
      const to = `ip-${randomUUID()}@ejemplo.com`;
      ipEmails.push(to);
      const response = await register(FIRST_NAME, FIRST_PASSWORD, to, sharedIp);
      expectStatus(response, index < REGISTRATIONS_PER_IP_PER_HOUR ? 202 : 429);
    }
  };

  /** Hashes que el flujo dejó en la BD: los de la contraseña y los de todos los tokens emitidos. */
  const collectStoredSecrets = async (): Promise<void> => {
    const rows = (await dataSource.query(
      `SELECT u.hash_clave, t.token_hash
         FROM usuario u LEFT JOIN token_cuenta t ON t.usuario_id = u.id
        WHERE u.correo = ANY($1)`,
      [[email, ...ipEmails]],
    )) as { hash_clave: string; token_hash: string | null }[];
    for (const row of rows) {
      secrets.add(row.hash_clave);
      if (row.token_hash !== null) secrets.add(row.token_hash);
    }
    for (const ipEmail of ipEmails) secrets.add(ipEmail.split('@')[0] ?? ipEmail);
  };

  /** Espera a que el `worker` termine cada correo encolado, para inspeccionar también sus líneas. */
  const waitForWorker = async (): Promise<void> => {
    await waitUntil(() => {
      const current = testApp.logs.lines();
      const enqueued = current.filter((line) => line.event === 'mail.enqueued').length;
      const sent = current.filter((line) => line.event === 'mail.sent').length;
      return Promise.resolve(enqueued > 0 && sent === enqueued ? true : undefined);
    }, 'entrega de todos los correos encolados');
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    await deleteAll();
    testApp.logs.clear();

    await runRegistrationFlows();
    await runVerificationFlows();
    await runExistingAccountAndIpFlows();
    await waitForWorker();

    const [user] = (await dataSource.query('SELECT id FROM usuario WHERE correo = $1', [
      email,
    ])) as { id: string }[];
    userId = user?.id ?? '';
    await collectStoredSecrets();
    for (const token of tokens) secrets.add(token);
    lines = testApp.logs.lines();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-18: ninguna línea trae contraseña, hash, token, su hash, URL del enlace, nombre ni correo', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const serialized = JSON.stringify(line);
      for (const secret of secrets) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it('CA-18: cada línea lleva `correlationId`', () => {
    const withoutCorrelation = lines.filter(
      (line) => typeof line.correlationId !== 'string' || line.correlationId === '',
    );

    expect(withoutCorrelation.map((line) => line.event ?? line.msg)).toEqual([]);
  });

  it('CA-18: el trabajo de correo del `worker` lleva el `correlationId` de la petición de registro', () => {
    const enqueued = lines.find(
      (line) => line.event === 'mail.enqueued' && line.correlationId === registrationCorrelationId,
    );
    const sent = lines.find((line) => line.event === 'mail.sent' && line.jobId === enqueued?.jobId);

    expect(enqueued).toMatchObject({ tag: 'identity.verification', recipientId: userId });
    expect(sent).toMatchObject({ correlationId: registrationCorrelationId, recipientId: userId });
  });

  it('CA-18: registra cada evento de plan §7 identificando la cuenta solo por su `id`', () => {
    const expected = [
      { event: 'identity.registration.accepted', kind: 'new', userId },
      { event: 'identity.registration.accepted', kind: 'pending_replaced', userId },
      { event: 'identity.registration.existing_account', userId },
      { event: 'identity.registration.attempt_notice_sent', userId },
      { event: 'identity.registration.attempt_notice_suppressed', userId },
      { event: 'identity.verification.resend_requested', userId },
      { event: 'identity.verification.succeeded', userId },
      { event: 'identity.account_verified.published', userId },
      { event: 'identity.verification.rejected', reason: 'invalid', userId },
      { event: 'identity.verification.rejected', reason: 'expired', userId },
      { event: 'identity.verification.rejected', reason: 'already_verified', userId },
      { event: 'identity.rate_limited', scope: 'email', retryAfterSeconds: expect.any(Number) },
      { event: 'identity.rate_limited', scope: 'ip', retryAfterSeconds: expect.any(Number) },
    ];

    for (const fields of expected) {
      expect(lines).toContainEqual(expect.objectContaining(fields));
    }
    const identityLines = lines.filter((line) => String(line.event).startsWith('identity.'));
    for (const line of identityLines) {
      if (line.userId !== undefined) expect(line.userId).toMatch(/^[0-9a-f-]{36}$/);
    }
    const unknownTokenRejection = identityLines.filter(
      (line) => line.event === 'identity.verification.rejected' && line.userId === undefined,
    );
    expect(unknownTokenRejection).toHaveLength(1);
  });

  it('CA-18: ninguna línea `identity.*` lleva `req`, `remoteAddress` ni la IP de `X-Forwarded-For`', () => {
    const identityLines = lines.filter((line) => String(line.event).startsWith('identity.'));

    expect(identityLines.length).toBeGreaterThan(0);
    for (const line of identityLines) {
      expect(line).not.toHaveProperty('req');
      const serialized = JSON.stringify(line);
      expect(serialized).not.toContain('remoteAddress');
      for (const ip of usedIps) {
        expect(serialized).not.toContain(ip);
      }
    }
  });
});
