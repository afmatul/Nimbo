import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { EMAIL_REQUEST_COOLDOWN_SECONDS, LEGAL_DOCUMENTS } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../src/shared';
import { createIdentityTestApp, validRegistration } from '../int/identity/identity-test-app';
import type { TestApp } from '../int/setup/test-app';

const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * 1000;
const ONE_HOUR_MS = 3_600_000;
/** PHC de relleno para las cuentas insertadas a mano: nadie inicia sesión con ellas. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVuaXNv$aXNvbGF0aW9u';
const EXISTING_NAME = 'Cuenta Existente Aislamiento';

/** Los cuatro tipos de correo que CA-14 y CA-15 exigen indistinguibles. */
const ACCOUNT_KINDS = ['inexistente', 'no-verificada', 'verificada', 'interna'] as const;
type AccountKind = (typeof ACCOUNT_KINDS)[number];

interface Account {
  readonly email: string;
  readonly id: string | null;
}

interface Step {
  readonly route: typeof REGISTER | typeof RESEND;
  readonly advanceMs: number;
}

/**
 * Registro y reenvío cuentan juntos (D-8): 1 cada 60 s y 5 por hora. Con el reloj fijo, cada tipo de correo recorre
 * la misma secuencia con los mismos tiempos relativos, así los `Retry-After` también deben coincidir.
 */
const SEQUENCE: readonly Step[] = [
  { route: REGISTER, advanceMs: 0 },
  { route: REGISTER, advanceMs: 0 },
  { route: RESEND, advanceMs: 0 },
  { route: RESEND, advanceMs: COOLDOWN_MS },
  { route: REGISTER, advanceMs: COOLDOWN_MS },
  { route: REGISTER, advanceMs: COOLDOWN_MS },
  { route: RESEND, advanceMs: COOLDOWN_MS },
  { route: REGISTER, advanceMs: COOLDOWN_MS },
  { route: RESEND, advanceMs: 0 },
];
const EXPECTED_STATUSES = [202, 429, 429, 202, 202, 202, 202, 429, 429];

/** Lo que ve quien llama. `date` se omite: es la hora de la respuesta y no depende de la cuenta. */
interface Observed {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, unknown>>;
}

const observe = (response: Response): Observed => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/**
 * Anti-enumeración de la 001 (RN-5, CA-14, CA-15, CA-5, CA-6, Art. IX). Cada petición equivalente lleva el mismo
 * `x-correlation-id` en los cuatro casos, así el cuerpo (que lo incluye) y sus cabeceras derivadas (`ETag`,
 * `Content-Length`) deben ser idénticos byte a byte; solo se excluye `date`. Cada tipo usa su propia IP para que el
 * límite por IP (10/h) no se mezcle con el de correo. Hoy corre con el rol dueño de la BD; cuando 003 cree
 * `nimbo_app`, correrá con ese rol (ADR-0005).
 */
describe('anti-enumeración de registro y reenvío (CA-14, CA-15, CA-5, CA-6)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  const clock = new FixedClock(new Date());
  let nextIp = 0;

  const insertAccount = async (kind: Exclude<AccountKind, 'inexistente'>): Promise<Account> => {
    const id = randomUUID();
    const email = `${kind}-${randomUUID()}@ejemplo.com`;
    const isInternal = kind === 'interna';
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado,
                            version_terminos, version_privacidad, terminos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        EXISTING_NAME,
        email,
        PLACEHOLDER_PHC,
        isInternal ? 'SUPPORT' : 'CLIENT',
        kind === 'verificada',
        isInternal ? null : LEGAL_DOCUMENTS.terms.version,
        isInternal ? null : LEGAL_DOCUMENTS.privacy.version,
        isInternal ? null : clock.now(),
      ],
    );
    return { email, id };
  };

  const prepareAccounts = async (): Promise<Record<AccountKind, Account>> => ({
    inexistente: { email: `inexistente-${randomUUID()}@ejemplo.com`, id: null },
    'no-verificada': await insertAccount('no-verificada'),
    verificada: await insertAccount('verificada'),
    interna: await insertAccount('interna'),
  });

  const post = (path: string, body: object, correlationId: string, ip: string): Promise<Response> =>
    request(testApp.app.getHttpServer())
      .post(path)
      .set('X-Forwarded-For', ip)
      .set('X-Correlation-Id', correlationId)
      .send(body);

  const newIp = (): string => `203.0.113.${String((nextIp += 1))}`;

  const runSequence = async (email: string, scenario: string): Promise<Observed[]> => {
    const ip = newIp();
    const observed: Observed[] = [];
    for (const [index, step] of SEQUENCE.entries()) {
      clock.advance(step.advanceMs);
      const body = step.route === REGISTER ? validRegistration(email) : { email };
      observed.push(observe(await post(step.route, body, `iso-${scenario}-${String(index)}`, ip)));
    }
    return observed;
  };

  /** Ninguna respuesta lleva datos de la cuenta, cookies ni cabeceras de límite. */
  const expectNothingRevealed = (observed: readonly Observed[], account: Account): void => {
    for (const response of observed) {
      const visible = JSON.stringify(response);
      expect(visible).not.toContain(account.email);
      expect(visible).not.toContain(EXISTING_NAME);
      if (account.id !== null) expect(visible).not.toContain(account.id);
      const names = Object.keys(response.headers);
      expect(names).not.toContain('set-cookie');
      expect(
        names.filter((name) => name.startsWith('x-ratelimit') || name.startsWith('retry-after-')),
      ).toEqual([]);
    }
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-14, CA-15: la misma secuencia de registro y reenvío da los mismos status, cuerpos y cabeceras en los cuatro tipos de correo', async () => {
    const accounts = await prepareAccounts();
    const results = {} as Record<AccountKind, Observed[]>;
    for (const kind of ACCOUNT_KINDS) {
      results[kind] = await runSequence(accounts[kind].email, 'secuencia');
    }

    expect(results.inexistente.map((response) => response.status)).toEqual(EXPECTED_STATUSES);
    for (const response of results.inexistente.filter((observed) => observed.status === 429)) {
      expect(response.headers['retry-after']).toMatch(/^\d+$/);
    }
    for (const kind of ACCOUNT_KINDS) {
      expect({ kind, observed: results[kind] }).toEqual({ kind, observed: results.inexistente });
      expectNothingRevealed(results[kind], accounts[kind]);
    }
  });

  it('CA-5: un 422 por contraseña débil es idéntico con correo existente y nuevo', async () => {
    const accounts = await prepareAccounts();
    const observed = {} as Record<AccountKind, Observed>;
    for (const kind of ACCOUNT_KINDS) {
      const body = { ...validRegistration(accounts[kind].email), password: 'corta' };
      observed[kind] = observe(await post(REGISTER, body, 'iso-debil', newIp()));
    }

    expect(observed.inexistente).toMatchObject({
      status: 422,
      body: { code: 'IDENTITY_WEAK_PASSWORD' },
    });
    for (const kind of ACCOUNT_KINDS) {
      expect({ kind, observed: observed[kind] }).toEqual({ kind, observed: observed.inexistente });
      expectNothingRevealed([observed[kind]], accounts[kind]);
    }
  });

  it('CA-6: un 422 por datos inválidos es idéntico con correo existente y nuevo', async () => {
    const accounts = await prepareAccounts();
    const observed = {} as Record<AccountKind, Observed>;
    for (const kind of ACCOUNT_KINDS) {
      const body = { ...validRegistration(accounts[kind].email), fullName: '', acceptTerms: false };
      observed[kind] = observe(await post(REGISTER, body, 'iso-invalido', newIp()));
    }

    expect(observed.inexistente).toMatchObject({
      status: 422,
      body: { code: 'IDENTITY_INVALID_INPUT' },
    });
    for (const kind of ACCOUNT_KINDS) {
      expect({ kind, observed: observed[kind] }).toEqual({ kind, observed: observed.inexistente });
    }
  });

  it('roles internos: un enlace de verificación ligado a una cuenta interna no la verifica ni devuelve sus datos', async () => {
    const internal = await insertAccount('interna');
    const token = randomBytes(32).toString('base64url');
    const now = clock.now();
    await dataSource.query(
      `INSERT INTO token_cuenta (usuario_id, tipo, token_hash, expira_en, creado_en)
       VALUES ($1, 'verificacion', $2, $3, $4)`,
      [
        internal.id,
        createHash('sha256').update(token).digest('hex'),
        new Date(now.getTime() + ONE_HOUR_MS),
        now,
      ],
    );
    const unknownToken = randomBytes(32).toString('base64url');

    const forInternal = observe(await post(VERIFY_EMAIL, { token }, 'iso-interna', newIp()));
    const forUnknown = observe(
      await post(VERIFY_EMAIL, { token: unknownToken }, 'iso-interna', newIp()),
    );

    expect(forInternal).toMatchObject({
      status: 422,
      body: { code: 'IDENTITY_VERIFICATION_LINK_INVALID' },
    });
    expect(forInternal).toEqual(forUnknown);
    expectNothingRevealed([forInternal], internal);
    const [row] = (await dataSource.query(
      `SELECT u.correo_verificado, t.usado_en
         FROM usuario u JOIN token_cuenta t ON t.usuario_id = u.id WHERE u.id = $1`,
      [internal.id],
    )) as { correo_verificado: boolean; usado_en: Date | null }[];
    expect(row).toEqual({ correo_verificado: false, usado_en: null });
  });
});
