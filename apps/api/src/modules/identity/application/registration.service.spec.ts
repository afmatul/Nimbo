import { createHash } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  LEGAL_DOCUMENTS,
} from '@nimbo/contracts';

import { PasswordHash } from '../../../shared';
import type { ITransactionRunner, RateLimitDecision, IPasswordHasher } from '../../../shared';
import { FixedClock } from '../../../shared/domain/fixed.clock';
import { Role } from '../../../shared/domain/role.enum';
import type { MailMessage } from '../../notifications';
import { AccountStatus } from '../domain/account-status.enum';
import type { ClientAccountVerifiedEvent } from '../domain/client-account-verified.event';
import { ClientUser } from '../domain/client-user.entity';
import { EmailAddress } from '../domain/email-address.vo';
import { EmployeeCode } from '../domain/employee-code.vo';
import {
  IdentityTooManyRequestsError,
  VerificationLinkExpiredError,
  VerificationLinkInvalidError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { VerificationToken } from '../domain/verification-token.entity';
import type { VerificationTokenType } from '../domain/verification-token.entity';

import type { IAccountEventsPublisher } from './ports/i-account-events-publisher.port';
import { RegistrationAttemptNotifier } from './registration-attempt-notifier';
import { RegistrationService } from './registration.service';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { VerificationLinkIssuer } from './verification-link-issuer';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const SECONDS_PER_HOUR = 3600;
const EMAIL = 'ana@ejemplo.com';
const PASSWORD = 'Nimbo-Seguro-2026';
const SUBJECT_VERIFICATION = 'Verifica tu correo para entrar a Nimbo';
const SUBJECT_ATTEMPT = 'Alguien intentó crear una cuenta con tu correo';
const ALLOWED: RateLimitDecision = { allowed: true };

const emailRequestKey = (email: string): string =>
  `identity:email-request:${createHash('sha256').update(email).digest('hex')}`;

/** Transacción falsa: anota el commit en la línea de tiempo común, o falla al confirmar si se le pide. */
class FakeTransactionRunner implements ITransactionRunner {
  runs = 0;
  failOnCommit = false;

  constructor(private readonly timeline: string[]) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    const result = await work();
    if (this.failOnCommit) {
      throw new Error('falla al confirmar');
    }
    this.timeline.push('commit');
    return result;
  }

  /** `usuario` y `token_cuenta` no son datos de cliente: el registro nunca abre una transacción con actor. */
  withActor<T>(): Promise<T> {
    return Promise.reject(new Error('RegistrationService no usa withActor'));
  }
}

const fakeHasher = (): jest.Mocked<IPasswordHasher> => ({
  hash: jest.fn((plain: string) => Promise.resolve(PasswordHash.fromPhc(`fake$${plain}`))),
  verify: jest.fn((hash: PasswordHash, plain: string) =>
    Promise.resolve(hash.reveal() === `fake$${plain}`),
  ),
});

const setup = () => {
  const timeline: string[] = [];
  const clock = new FixedClock(NOW);
  const config = { webPublicUrl: 'http://localhost', cookieSecure: false };
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const hasher = fakeHasher();
  const decisions = new Map<string, RateLimitDecision>();
  const rateLimiter = {
    consume: jest.fn((key: string) => Promise.resolve(decisions.get(key) ?? ALLOWED)),
  };
  const sent: MailMessage[] = [];
  const mailer = {
    send: jest.fn((message: MailMessage) => {
      timeline.push(`mail:${message.tag}`);
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const events: jest.Mocked<IAccountEventsPublisher> = {
    clientAccountVerified: jest.fn((_event: ClientAccountVerifiedEvent) => {
      timeline.push('event');
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const transactions = new FakeTransactionRunner(timeline);
  const linkIssuer = new VerificationLinkIssuer(tokens, clock, config);
  const attemptNotifier = new RegistrationAttemptNotifier(rateLimiter, clock, config, logger);
  const service = new RegistrationService(
    users,
    tokens,
    hasher,
    mailer,
    events,
    rateLimiter,
    transactions,
    clock,
    linkIssuer,
    attemptNotifier,
    logger,
  );
  return {
    service,
    users,
    tokens,
    hasher,
    decisions,
    rateLimiter,
    mailer,
    events,
    sent,
    logger,
    transactions,
    timeline,
    clock,
  };
};

const registerCommand = (
  overrides: Partial<{ fullName: string; email: string; password: string }> = {},
) => ({
  fullName: 'Ana López',
  email: EMAIL,
  password: PASSWORD,
  ...overrides,
});

const anInternalUser = (email = EMAIL): InternalUser =>
  InternalUser.rehydrate({
    id: '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e',
    fullName: 'Soporte Nimbo',
    email: EmailAddress.of(email),
    passwordHash: PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ'),
    role: Role.SUPPORT,
    status: AccountStatus.ACTIVE,
    emailVerified: true,
    employeeCode: EmployeeCode.of('SOP-001'),
  });

const loggedEvents = (logger: { info: jest.Mock; warn: jest.Mock }): unknown[] =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(([payload]) => payload);

describe('RegistrationService.register', () => {
  it('CA-1: crea una cuenta de cliente pendiente, con la aceptación vigente, y envía el enlace', async () => {
    const { service, users, tokens, sent } = setup();

    await service.register(registerCommand());

    const [user] = users.all();
    expect(users.all()).toHaveLength(1);
    expect(user).toBeInstanceOf(ClientUser);
    const client = user as ClientUser;
    expect(client.role).toBe(Role.CLIENT);
    expect(client.emailVerified).toBe(false);
    expect(client.status).toBe(AccountStatus.ACTIVE);
    expect(client.fullName).toBe('Ana López');
    expect(client.passwordHash.reveal()).toBe(`fake$${PASSWORD}`);
    expect(client.acceptance.termsVersion).toBe(LEGAL_DOCUMENTS.terms.version);
    expect(client.acceptance.privacyVersion).toBe(LEGAL_DOCUMENTS.privacy.version);
    expect(client.acceptance.acceptedAt).toEqual(NOW);
    expect(tokens.all().filter((token) => token.isValid(NOW))).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: EMAIL,
      subject: SUBJECT_VERIFICATION,
      recipientId: client.id,
    });
  });

  it('CA-1: registra `identity.registration.accepted` con `kind = new` y solo el id', async () => {
    const { service, users, logger } = setup();

    await service.register(registerCommand());

    const [user] = users.all();
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.registration.accepted',
      userId: user?.id,
      kind: 'new',
    });
  });

  it('CA-1: quita los espacios alrededor del nombre antes de guardarlo', async () => {
    const { service, users } = setup();

    await service.register(registerCommand({ fullName: '  Ana López  ' }));

    expect(users.all()[0]?.fullName).toBe('Ana López');
  });

  it('CA-3: normaliza el correo y trata una variante como el mismo correo', async () => {
    const { service, users, sent } = setup();
    users.seed(aClientUser().withEmail(EMAIL).verified().build());

    await service.register(registerCommand({ email: '  Ana@Ejemplo.COM ' }));

    expect(users.all()).toHaveLength(1);
    expect(sent.map((message) => message.subject)).toEqual([SUBJECT_ATTEMPT]);
  });

  it('CA-15: consulta el límite por correo (hash del correo normalizado, 60 s y 5/h) antes que el repositorio', async () => {
    const { service, users, rateLimiter } = setup();
    const findSpy = jest.spyOn(users, 'findByEmailForUpdate');

    await service.register(registerCommand({ email: ' ANA@ejemplo.com' }));

    expect(rateLimiter.consume).toHaveBeenNthCalledWith(1, emailRequestKey(EMAIL), [
      { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
      { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
    ]);
    expect(rateLimiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      findSpy.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('CA-15: si el límite rechaza, lanza el 429 de `identity`, lo registra y no toca nada más', async () => {
    const { service, users, decisions, hasher, mailer, logger, transactions } = setup();
    decisions.set(emailRequestKey(EMAIL), { allowed: false, retryAfterSeconds: 42 });
    users.seed(aClientUser().withEmail(EMAIL).build());
    const findSpy = jest.spyOn(users, 'findByEmailForUpdate');

    const attempt = service.register(registerCommand());

    await expect(attempt).rejects.toBeInstanceOf(IdentityTooManyRequestsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 42, scope: 'email' });
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'identity.rate_limited',
      scope: 'email',
      retryAfterSeconds: 42,
    });
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(findSpy).not.toHaveBeenCalled();
    expect(transactions.runs).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('CA-2: calcula el hash de la contraseña también cuando el correo ya existe', async () => {
    const { service, users, hasher } = setup();
    const existing = aClientUser().withEmail(EMAIL).verified().build();
    users.seed(existing);

    await service.register(registerCommand({ password: 'Otra-Clave-2026!' }));

    expect(hasher.hash).toHaveBeenCalledWith('Otra-Clave-2026!');
    expect(users.all()).toEqual([existing]);
  });

  it('CA-2: sobre una cuenta verificada no cambia nada, no emite enlace y avisa al dueño', async () => {
    const { service, users, tokens, sent, logger } = setup();
    const existing = aClientUser().withEmail(EMAIL).verified().build();
    users.seed(existing);

    await service.register(registerCommand({ fullName: 'Intruso' }));

    expect(users.all()).toEqual([existing]);
    expect(tokens.all()).toHaveLength(0);
    expect(sent.map((message) => message.subject)).toEqual([SUBJECT_ATTEMPT]);
    expect(sent[0]?.recipientId).toBe(existing.id);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.registration.existing_account',
      userId: existing.id,
    });
  });

  it('CA-2: sobre una cuenta interna tampoco cambia nada y avisa al dueño', async () => {
    const { service, users, tokens, sent } = setup();
    const internal = anInternalUser();
    users.seed(internal);

    await service.register(registerCommand());

    expect(users.all()).toEqual([internal]);
    expect(tokens.all()).toHaveLength(0);
    expect(sent.map((message) => message.recipientId)).toEqual([internal.id]);
  });

  it('CA-2: si el límite de avisos lo suprime, no envía ningún correo', async () => {
    const { service, users, decisions, mailer } = setup();
    const existing = aClientUser().withEmail(EMAIL).verified().build();
    users.seed(existing);
    decisions.set(`identity:attempt-notice:${existing.id}`, {
      allowed: false,
      retryAfterSeconds: SECONDS_PER_HOUR,
    });

    await service.register(registerCommand());

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('CA-4: sobre una cuenta pendiente reemplaza nombre, contraseña y aceptación y emite un enlace nuevo', async () => {
    const { service, users, tokens, sent, logger, clock } = setup();
    const pending = aClientUser().withEmail(EMAIL).build();
    users.seed(pending);
    await service.register(registerCommand({ fullName: 'Ana Uno', password: 'Clave-Uno-2026!' }));
    const [firstToken] = tokens.all();
    clock.advance(2 * EMAIL_REQUEST_COOLDOWN_SECONDS * 1000);

    await service.register(registerCommand({ fullName: 'Ana Dos', password: 'Clave-Dos-2026!' }));

    const replaced = users.all()[0] as ClientUser;
    expect(users.all()).toHaveLength(1);
    expect(replaced.id).toBe(pending.id);
    expect(replaced.fullName).toBe('Ana Dos');
    expect(replaced.passwordHash.reveal()).toBe('fake$Clave-Dos-2026!');
    expect(replaced.acceptance.acceptedAt).toEqual(clock.now());
    expect(replaced.emailVerified).toBe(false);
    const current = tokens.all().find((token) => token.id === firstToken?.id);
    expect(current?.stateAt(clock.now())).toBe('invalidated');
    expect(tokens.all().filter((token) => token.isValid(clock.now()))).toHaveLength(1);
    expect(sent.map((message) => message.subject)).toEqual([
      SUBJECT_VERIFICATION,
      SUBJECT_VERIFICATION,
    ]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.registration.accepted',
      userId: pending.id,
      kind: 'pending_replaced',
    });
  });

  it('CA-3: si otra transacción confirmó el correo entre la lectura y el alta, sigue por la rama de esa cuenta', async () => {
    const { service, users, sent, transactions } = setup();
    const concurrent = aClientUser().withEmail(EMAIL).verified().build();
    jest.spyOn(users, 'insertIfAbsent').mockImplementationOnce(() => {
      users.seed(concurrent);
      return Promise.resolve(false);
    });

    await service.register(registerCommand());

    expect(users.all()).toEqual([concurrent]);
    expect(transactions.runs).toBe(1);
    expect(sent.map((message) => message.subject)).toEqual([SUBJECT_ATTEMPT]);
  });

  it('CA-3: si el alta choca y la cuenta tampoco aparece, reintenta la transacción una vez', async () => {
    const { service, users, sent, transactions } = setup();
    jest.spyOn(users, 'insertIfAbsent').mockResolvedValueOnce(false);

    await service.register(registerCommand());

    expect(transactions.runs).toBe(2);
    expect(users.all()).toHaveLength(1);
    expect(sent.map((message) => message.subject)).toEqual([SUBJECT_VERIFICATION]);
  });

  it('CA-3: si tras el reintento la cuenta sigue sin aparecer, falla sin enviar correo', async () => {
    const { service, users, mailer, transactions } = setup();
    jest.spyOn(users, 'insertIfAbsent').mockResolvedValue(false);

    await expect(service.register(registerCommand())).rejects.toThrow(Error);
    expect(transactions.runs).toBe(2);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('CA-1: el correo se envía después del commit', async () => {
    const { service, timeline } = setup();

    await service.register(registerCommand());

    expect(timeline).toEqual(['commit', 'mail:identity.verification']);
  });

  it('CA-1: si la transacción falla, no se envía ningún correo', async () => {
    const { service, mailer, transactions } = setup();
    transactions.failOnCommit = true;

    await expect(service.register(registerCommand())).rejects.toThrow('falla al confirmar');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('CA-7: la cuenta nace CLIENT, sin verificar y con la versión vigente aunque el comando traiga otros campos', async () => {
    const { service, users } = setup();
    const command = {
      ...registerCommand(),
      role: 'ADMIN',
      emailVerified: true,
      termsVersion: '0.1',
    };

    await service.register(command);

    const client = users.all()[0] as ClientUser;
    expect(client.role).toBe(Role.CLIENT);
    expect(client.emailVerified).toBe(false);
    expect(client.acceptance.termsVersion).toBe(LEGAL_DOCUMENTS.terms.version);
  });

  it('CA-18: las bitácoras no llevan correo, nombre, contraseña, hash ni enlace', async () => {
    const { service, users, sent, logger } = setup();
    users.seed(aClientUser().withEmail('otra@ejemplo.com').verified().build());

    await service.register(registerCommand());
    await service.register(registerCommand({ email: 'otra@ejemplo.com' }));

    const logs = JSON.stringify(loggedEvents(logger));
    for (const secret of [EMAIL, 'otra@ejemplo.com', 'Ana López', PASSWORD, 'fake$', 'token=']) {
      expect(logs).not.toContain(secret);
    }
    expect(sent).toHaveLength(2);
  });
});

describe('RegistrationService.resendVerification', () => {
  it('CA-15: usa la misma clave y las mismas reglas de límite que el registro', async () => {
    const { service, rateLimiter } = setup();

    await service.register(registerCommand());
    await service.resendVerification({ email: ' Ana@Ejemplo.com ' });

    expect(rateLimiter.consume.mock.calls[0]).toEqual(rateLimiter.consume.mock.calls[1]);
    expect(rateLimiter.consume.mock.calls[1]?.[0]).toBe(emailRequestKey(EMAIL));
  });

  it('CA-15: si el límite rechaza, lanza el 429 de `identity` y no emite enlace', async () => {
    const { service, users, decisions, tokens, mailer, logger } = setup();
    users.seed(aClientUser().withEmail(EMAIL).build());
    decisions.set(emailRequestKey(EMAIL), { allowed: false, retryAfterSeconds: 30 });

    await expect(service.resendVerification({ email: EMAIL })).rejects.toMatchObject({
      code: 'IDENTITY_TOO_MANY_REQUESTS',
      retryAfterSeconds: 30,
    });
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'identity.rate_limited',
      scope: 'email',
      retryAfterSeconds: 30,
    });
    expect(tokens.all()).toHaveLength(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('CA-13: a un cliente no verificado le emite un enlace nuevo e invalida los anteriores', async () => {
    const { service, users, tokens, sent, logger } = setup();
    const pending = aClientUser().withEmail(EMAIL).build();
    users.seed(pending);

    await service.resendVerification({ email: EMAIL });
    await service.resendVerification({ email: EMAIL });

    expect(tokens.all()).toHaveLength(2);
    expect(tokens.all().filter((token) => token.isValid(NOW))).toHaveLength(1);
    expect(sent.map((message) => message.subject)).toEqual([
      SUBJECT_VERIFICATION,
      SUBJECT_VERIFICATION,
    ]);
    expect(sent[1]?.recipientId).toBe(pending.id);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.verification.resend_requested',
      userId: pending.id,
    });
  });

  it('CA-13: el correo se envía después del commit y nunca si la transacción falla', async () => {
    const { service, users, timeline, transactions, mailer } = setup();
    users.seed(aClientUser().withEmail(EMAIL).build());

    await service.resendVerification({ email: EMAIL });
    transactions.failOnCommit = true;
    await expect(service.resendVerification({ email: EMAIL })).rejects.toThrow(
      'falla al confirmar',
    );

    expect(timeline).toEqual(['commit', 'mail:identity.verification']);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['inexistente', (_users: InMemoryUserRepository): void => undefined],
    [
      'verificado',
      (users: InMemoryUserRepository): void => {
        users.seed(aClientUser().withEmail(EMAIL).verified().build());
      },
    ],
    [
      'de una cuenta interna',
      (users: InMemoryUserRepository): void => {
        users.seed(anInternalUser());
      },
    ],
  ])(
    'CA-14: con un correo %s no emite nada y registra `resend_ignored` sin id',
    async (_case, arrange) => {
      const { service, users, tokens, mailer, logger } = setup();
      arrange(users);

      await service.resendVerification({ email: EMAIL });

      expect(tokens.all()).toHaveLength(0);
      expect(mailer.send).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith({ event: 'identity.verification.resend_ignored' });
    },
  );

  it('CA-18: las bitácoras del reenvío no llevan el correo ni el enlace', async () => {
    const { service, users, logger } = setup();
    users.seed(aClientUser().withEmail(EMAIL).build());

    await service.resendVerification({ email: EMAIL });
    await service.resendVerification({ email: 'nadie@ejemplo.com' });

    const logs = JSON.stringify(loggedEvents(logger));
    for (const secret of [EMAIL, 'nadie@ejemplo.com', 'token=']) {
      expect(logs).not.toContain(secret);
    }
  });
});

const MS_PER_HOUR = 3_600_000;
const TOKEN_TTL_MS = 24 * MS_PER_HOUR;
let tokenSequence = 0;

type TokenState = 'valid' | 'used' | 'expired' | 'invalidated';

const TOKEN_TRANSITIONS: Record<TokenState, (token: VerificationToken) => VerificationToken> = {
  valid: (token) => token,
  expired: (token) => token,
  used: (token) => token.consume(NOW),
  invalidated: (token) => token.invalidate(NOW),
};

/** Guarda un token en el estado pedido (visto en `NOW`) y devuelve su valor en claro, como lo trae el enlace. */
const seedToken = async (
  tokens: InMemoryVerificationTokenRepository,
  userId: string,
  state: TokenState = 'valid',
  type: VerificationTokenType = 'verificacion',
): Promise<string> => {
  tokenSequence += 1;
  const value = OpaqueToken.generate().value;
  const ageMs = state === 'expired' ? 2 * TOKEN_TTL_MS : MS_PER_HOUR;
  const createdAt = new Date(NOW.getTime() - ageMs);
  const issued = VerificationToken.issue({
    id: `00000000-0000-4000-8000-${String(tokenSequence).padStart(12, '0')}`,
    userId,
    type,
    tokenHash: OpaqueToken.hashOf(value),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + TOKEN_TTL_MS),
  });
  await tokens.insert(TOKEN_TRANSITIONS[state](issued));
  return value;
};

const REJECTED = 'identity.verification.rejected';

describe('RegistrationService.verifyEmail', () => {
  it('CA-8: con un enlace válido verifica la cuenta, consume el token, invalida los demás y devuelve `VERIFIED`', async () => {
    const { service, users, tokens, logger } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id);
    await seedToken(tokens, pending.id);

    const result = await service.verifyEmail(value);

    expect(result).toMatchObject({ outcome: 'VERIFIED', userId: pending.id });
    expect(result.outcome === 'VERIFIED' ? result.user.emailVerified : false).toBe(true);
    expect((await users.findByIdForUpdate(pending.id))?.emailVerified).toBe(true);
    expect(tokens.all().filter((token) => token.isValid(NOW))).toHaveLength(0);
    expect(tokens.all().filter((token) => token.usedAt !== null)).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.verification.succeeded',
      userId: pending.id,
    });
  });

  it('CA-8: publica el evento una sola vez, después del commit y solo con `VERIFIED`', async () => {
    const { service, users, tokens, events, timeline } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id);

    await service.verifyEmail(value);
    const second = await service.verifyEmail(value);

    expect(second).toEqual({ outcome: 'ALREADY_VERIFIED' });
    expect(events.clientAccountVerified).toHaveBeenCalledTimes(1);
    expect(events.clientAccountVerified).toHaveBeenCalledWith({ userId: pending.id });
    expect(timeline).toEqual(['commit', 'event', 'commit']);
  });

  it('CA-8: no publica el evento si la transacción falla al confirmar', async () => {
    const { service, users, tokens, events, transactions } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id);
    transactions.failOnCommit = true;

    await expect(service.verifyEmail(value)).rejects.toThrow('falla al confirmar');

    expect(events.clientAccountVerified).not.toHaveBeenCalled();
  });

  it('CA-11: un token mal formado es inválido sin consultar la base', async () => {
    const { service, tokens, transactions, logger } = setup();
    const findByHash = jest.spyOn(tokens, 'findByHash');

    await expect(service.verifyEmail('no-es-un-token')).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );

    expect(findByHash).not.toHaveBeenCalled();
    expect(transactions.runs).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ event: REJECTED, reason: 'invalid' });
  });

  it('CA-11: un token bien formado que no existe es inválido y la bitácora no lleva `userId`', async () => {
    const { service, logger } = setup();

    await expect(service.verifyEmail(OpaqueToken.generate().value)).rejects.toBeInstanceOf(
      VerificationLinkInvalidError,
    );

    expect(logger.info).toHaveBeenCalledWith({ event: REJECTED, reason: 'invalid' });
  });

  it('CA-12: un token de recuperación no sirve como enlace de verificación', async () => {
    const { service, users, tokens, events } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id, 'valid', 'recuperacion');

    await expect(service.verifyEmail(value)).rejects.toBeInstanceOf(VerificationLinkInvalidError);

    expect((await users.findByIdForUpdate(pending.id))?.emailVerified).toBe(false);
    expect(events.clientAccountVerified).not.toHaveBeenCalled();
  });

  it.each<[TokenState]>([['used'], ['invalidated']])(
    'CA-11: un token %s de una cuenta sin verificar es inválido',
    async (state) => {
      const { service, users, tokens, logger } = setup();
      const pending = aClientUser().build();
      users.seed(pending);
      const value = await seedToken(tokens, pending.id, state);

      await expect(service.verifyEmail(value)).rejects.toBeInstanceOf(VerificationLinkInvalidError);

      expect((await users.findByIdForUpdate(pending.id))?.emailVerified).toBe(false);
      expect(logger.info).toHaveBeenCalledWith({
        event: REJECTED,
        reason: 'invalid',
        userId: pending.id,
      });
    },
  );

  it('CA-9: un token vencido de una cuenta sin verificar lanza `VerificationLinkExpiredError`', async () => {
    const { service, users, tokens, logger } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id, 'expired');

    await expect(service.verifyEmail(value)).rejects.toBeInstanceOf(VerificationLinkExpiredError);

    expect((await users.findByIdForUpdate(pending.id))?.emailVerified).toBe(false);
    expect(logger.info).toHaveBeenCalledWith({
      event: REJECTED,
      reason: 'expired',
      userId: pending.id,
    });
  });

  it.each<[TokenState]>([['valid'], ['used'], ['invalidated'], ['expired']])(
    'CA-10: con la cuenta ya verificada, un enlace %s devuelve `ALREADY_VERIFIED` sin evento',
    async (state) => {
      const { service, users, tokens, events, logger } = setup();
      const verified = aClientUser().verified().build();
      users.seed(verified);
      const value = await seedToken(tokens, verified.id, state);

      const result = await service.verifyEmail(value);

      expect(result).toEqual({ outcome: 'ALREADY_VERIFIED' });
      expect(events.clientAccountVerified).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith({
        event: REJECTED,
        reason: 'already_verified',
        userId: verified.id,
      });
    },
  );

  it('CA-29: si otra apertura consumió el token primero, devuelve `ALREADY_VERIFIED` sin tocar la cuenta', async () => {
    const { service, users, tokens, events } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id);
    jest.spyOn(tokens, 'consume').mockResolvedValue(false);

    const result = await service.verifyEmail(value);

    expect(result).toEqual({ outcome: 'ALREADY_VERIFIED' });
    expect((await users.findByIdForUpdate(pending.id))?.emailVerified).toBe(false);
    expect(events.clientAccountVerified).not.toHaveBeenCalled();
  });

  it('CA-18: las bitácoras de la verificación no llevan el token ni su hash', async () => {
    const { service, users, tokens, logger } = setup();
    const pending = aClientUser().build();
    users.seed(pending);
    const value = await seedToken(tokens, pending.id);

    await service.verifyEmail(value);
    await service.verifyEmail(value);

    const logs = JSON.stringify(loggedEvents(logger));
    expect(logs).not.toContain(value);
    expect(logs).not.toContain(OpaqueToken.hashOf(value));
  });
});
