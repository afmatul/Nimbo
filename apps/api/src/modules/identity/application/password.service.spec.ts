import { createHash, randomUUID } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MINUTES,
  RESET_LINK_TTL_MINUTES,
} from '@nimbo/contracts';

import { createActor } from '../../../shared';
import type { RateLimitDecision } from '../../../shared';
import { FixedClock } from '../../../shared/domain/fixed.clock';
import { Role } from '../../../shared/domain/role.enum';
import type { MailMessage } from '../../notifications';
import { AccountStatus } from '../domain/account-status.enum';
import { EmailAddress } from '../domain/email-address.vo';
import { EmployeeCode } from '../domain/employee-code.vo';
import {
  IdentityTooManyRequestsError,
  IdentityWeakPasswordError,
  PasswordChangeLockedError,
  ResetLinkExpiredError,
  ResetLinkInvalidError,
  WrongPasswordError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { PasswordHash } from '../domain/password-hash.vo';
import { Session } from '../domain/session.entity';
import type { User } from '../domain/user.entity';
import { VerificationToken } from '../domain/verification-token.entity';

import { PasswordService } from './password.service';
import type {
  AttemptReservation,
  IAttemptLockout,
  LockoutPolicy,
  LockState,
} from './ports/i-attempt-lockout.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { aClientUser } from './testing/client-user.builder';
import { InMemorySessionRepository } from './testing/in-memory-session.repository';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { RecordingTransactionRunner } from './testing/recording-transaction-runner';
import { VerificationLinkIssuer } from './verification-link-issuer';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const MS_PER_MINUTE = 60_000;
const RESET_TTL_MS = RESET_LINK_TTL_MINUTES * MS_PER_MINUTE;
const SECONDS_PER_HOUR = 3600;
const NEW_PASSWORD = 'Otra-Clave-Segura-2026';
const ALLOWED: RateLimitDecision = { allowed: true };
const UNLOCKED: LockState = { locked: false };
const RESERVED: AttemptReservation = { allowed: true, engagedLock: false };
const RESET_TAG = 'identity.password-reset';
const CHANGED_TAG = 'identity.password-changed';
const VERIFICATION_TAG = 'identity.verification';
const RESET_LINK = /\/restablecer-contrasena#token=([A-Za-z0-9_-]{43})/;
const VERIFICATION_LINK = /\/verificar-correo#token=([A-Za-z0-9_-]{43})/;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const resetRequestKey = (email: string): string =>
  `identity:password-reset-request:${sha256(email)}`;
const emailRequestKey = (email: string): string => `identity:email-request:${sha256(email)}`;

const anInternalUser = (): InternalUser =>
  InternalUser.rehydrate({
    id: randomUUID(),
    fullName: 'Soporte Nimbo',
    email: EmailAddress.of('soporte@nimbo.me'),
    passwordHash: PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ'),
    role: Role.SUPPORT,
    status: AccountStatus.ACTIVE,
    emailVerified: true,
    employeeCode: EmployeeCode.of('SOP-001'),
  });

/** Invitación de alta (011) todavía vigente para `userId`: la cuenta interna nunca fijó su primera contraseña. */
const aPendingInvitation = (userId: string): VerificationToken =>
  VerificationToken.issue({
    id: randomUUID(),
    userId,
    type: 'alta_interna',
    tokenHash: OpaqueToken.generate().hash(),
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
  });

const setup = () => {
  const timeline: string[] = [];
  const clock = new FixedClock(NOW);
  const config = { webPublicUrl: 'http://localhost/', cookieSecure: false };
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const sessions = new InMemorySessionRepository();
  const hasher: jest.Mocked<IPasswordHasher> = {
    hash: jest.fn((plain: string) => {
      timeline.push('hash');
      return Promise.resolve(PasswordHash.fromPhc(`fake$${plain}`));
    }),
    verify: jest.fn((_hash: PasswordHash, _plain: string) => Promise.resolve(false)),
  };
  const sent: MailMessage[] = [];
  const mailer = {
    send: jest.fn((message: MailMessage) => {
      timeline.push(`mail:${message.tag}`);
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const lockout: jest.Mocked<IAttemptLockout> = {
    check: jest.fn((_key: string) => Promise.resolve(UNLOCKED)),
    recordFailure: jest.fn((_key: string, _policy: LockoutPolicy) => Promise.resolve(UNLOCKED)),
    reserveAttempt: jest.fn((_key: string, _policy: LockoutPolicy) => Promise.resolve(RESERVED)),
    clear: jest.fn((key: string) => {
      timeline.push(`clear:${key}`);
      return Promise.resolve();
    }),
  };
  const decisions = new Map<string, RateLimitDecision>();
  const rateLimiter = {
    consume: jest.fn((key: string) => Promise.resolve(decisions.get(key) ?? ALLOWED)),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const service = new PasswordService(
    users,
    tokens,
    sessions,
    hasher,
    mailer,
    lockout,
    rateLimiter,
    new RecordingTransactionRunner(timeline),
    clock,
    config,
    new VerificationLinkIssuer(tokens, clock, config),
    logger,
  );
  const user = aClientUser().verified().build();
  users.seed(user);
  return {
    service,
    clock,
    users,
    tokens,
    sessions,
    hasher,
    mailer,
    sent,
    lockout,
    decisions,
    rateLimiter,
    logger,
    timeline,
    user,
  };
};

type Setup = ReturnType<typeof setup>;

const loggedEvents = (logger: Setup['logger']): unknown[] =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(([payload]) => payload);

/** Pide la recuperación para `user` y devuelve el token del enlace del último correo. */
const requestLinkFor = async ({ service, sent }: Setup, user: User): Promise<string> => {
  await service.requestReset({ email: user.email.value });
  const token = RESET_LINK.exec(sent.at(-1)?.text ?? '')?.[1];
  if (token === undefined) throw new Error('No salió el enlace de recuperación.');
  return token;
};

const openSessionFor = async (sessions: InMemorySessionRepository, userId: string) => {
  const session = Session.open({
    id: randomUUID(),
    userId,
    deviceId: randomUUID(),
    secretHash: sha256(randomUUID()),
    now: NOW,
    maxLifetime: 30 * 24 * 60 * MS_PER_MINUTE,
  });
  await sessions.insert(session);
  return session;
};

describe('PasswordService.requestReset (plan 002 §6.3, CA-18)', () => {
  it('CA-18: consume el límite de recuperación por correo (60 s y 5 por hora) antes de buscar la cuenta', async () => {
    const ctx = setup();
    const findByEmail = jest.spyOn(ctx.users, 'findByEmailForUpdate');

    await ctx.service.requestReset({ email: '  Ana@Ejemplo.COM ' });

    expect(ctx.rateLimiter.consume).toHaveBeenNthCalledWith(1, resetRequestKey('ana@ejemplo.com'), [
      { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
      { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
    ]);
    expect(ctx.rateLimiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      findByEmail.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each([
    ['con cuenta', 'ana@ejemplo.com'],
    ['sin cuenta', 'nadie@ejemplo.com'],
  ])(
    'CA-18: límite agotado %s → `IdentityTooManyRequestsError` de recuperación, sin buscar ni enviar',
    async (_case, email) => {
      const ctx = setup();
      ctx.decisions.set(resetRequestKey(email), { allowed: false, retryAfterSeconds: 42 });
      const findByEmail = jest.spyOn(ctx.users, 'findByEmailForUpdate');

      const attempt = ctx.service.requestReset({ email });

      await expect(attempt).rejects.toBeInstanceOf(IdentityTooManyRequestsError);
      await expect(attempt).rejects.toMatchObject({
        scope: 'password_reset',
        retryAfterSeconds: 42,
      });
      expect(findByEmail).not.toHaveBeenCalled();
      expect(ctx.sent).toEqual([]);
      expect(ctx.logger.warn).toHaveBeenCalledWith({
        event: 'identity.rate_limited',
        scope: 'password_reset',
        retryAfterSeconds: 42,
      });
    },
  );

  it('CA-18: correo sin cuenta → nada que enviar ni guardar; la bitácora no lleva `userId`', async () => {
    const ctx = setup();

    await expect(ctx.service.requestReset({ email: 'nadie@ejemplo.com' })).resolves.toBeUndefined();

    expect(ctx.sent).toEqual([]);
    expect(ctx.tokens.all()).toEqual([]);
    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_reset.requested', kind: 'ignored' },
    ]);
  });

  it('CA-18: cuenta verificada → invalida los enlaces anteriores y guarda solo el hash del nuevo, de 1 hora', async () => {
    const ctx = setup();
    const first = await requestLinkFor(ctx, ctx.user);
    ctx.clock.advance(EMAIL_REQUEST_COOLDOWN_SECONDS * 1000);

    const second = await requestLinkFor(ctx, ctx.user);

    const byHash = (value: string) =>
      ctx.tokens.all().find((token) => token.tokenHash === OpaqueToken.hashOf(value));
    expect(byHash(first)?.invalidatedAt).not.toBeNull();
    const current = byHash(second);
    expect(current).toMatchObject({ userId: ctx.user.id, type: 'recuperacion' });
    expect(current?.expiresAt.getTime()).toBe(ctx.clock.now().getTime() + RESET_TTL_MS);
    expect(ctx.tokens.all().map((token) => token.tokenHash)).not.toContain(second);
  });

  it('CA-18: el correo sale después del commit, al dueño, con el enlace en el fragmento y la clave del token', async () => {
    const ctx = setup();

    const value = await requestLinkFor(ctx, ctx.user);

    const [token] = ctx.tokens.all();
    expect(ctx.timeline).toEqual(['commit', `mail:${RESET_TAG}`]);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]).toMatchObject({
      to: ctx.user.email.value,
      subject: 'Restablece tu contraseña de Nimbo',
      tag: RESET_TAG,
      idempotencyKey: `${RESET_TAG}.${token?.id ?? ''}`,
      recipientId: ctx.user.id,
    });
    expect(ctx.sent[0]?.text).toContain(`http://localhost/restablecer-contrasena#token=${value}`);
    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_reset.requested', kind: 'reset_link', userId: ctx.user.id },
    ]);
  });

  it.each([
    ['interna', () => anInternalUser()],
    ['suspendida (DT-6)', () => aClientUser().verified().suspended().build()],
  ])('CA-18: cuenta %s → también recibe el enlace de recuperación', async (_case, build) => {
    const ctx = setup();
    const account = build();
    ctx.users.seed(account);

    await requestLinkFor(ctx, account);

    expect(ctx.sent.map((message) => [message.to, message.tag])).toEqual([
      [account.email.value, RESET_TAG],
    ]);
  });

  describe('cliente sin verificar (D-15, DT-7)', () => {
    const unverified = () =>
      aClientUser().withId(randomUUID()).withEmail('beto@ejemplo.com').build();

    it('CA-18: envía un enlace de verificación nuevo, no uno de recuperación, sin consultar ni gastar el límite de 001 (SEC-1)', async () => {
      const ctx = setup();
      const account = unverified();
      ctx.users.seed(account);
      ctx.decisions.set(emailRequestKey(account.email.value), {
        allowed: false,
        retryAfterSeconds: 30,
      });

      await ctx.service.requestReset({ email: account.email.value });

      expect(ctx.rateLimiter.consume).toHaveBeenCalledTimes(1);
      expect(ctx.rateLimiter.consume).not.toHaveBeenCalledWith(
        emailRequestKey(account.email.value),
        expect.anything(),
      );
      expect(ctx.tokens.all().map((token) => token.type)).toEqual(['verificacion']);
      expect(ctx.sent).toHaveLength(1);
      expect(ctx.sent[0]).toMatchObject({ to: account.email.value, tag: VERIFICATION_TAG });
      expect(ctx.sent[0]?.text).toMatch(VERIFICATION_LINK);
      expect(ctx.timeline).toEqual(['commit', `mail:${VERIFICATION_TAG}`]);
      expect(loggedEvents(ctx.logger)).toEqual([
        {
          event: 'identity.password_reset.requested',
          kind: 'verification_link',
          userId: account.id,
        },
      ]);
    });
  });
});

describe('PasswordService.checkResetLink (plan 002 §6.3, CA-20)', () => {
  it('CA-20: un valor mal formado → `ResetLinkInvalidError` sin consultar', async () => {
    const ctx = setup();
    const findByHash = jest.spyOn(ctx.tokens, 'findByHash');

    await expect(ctx.service.checkResetLink('no-es-un-token')).rejects.toBeInstanceOf(
      ResetLinkInvalidError,
    );
    expect(findByHash).not.toHaveBeenCalled();
    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_reset.rejected', reason: 'invalid' },
    ]);
  });

  it('CA-20: un valor bien formado que no existe → `ResetLinkInvalidError`', async () => {
    const ctx = setup();

    await expect(
      ctx.service.checkResetLink(OpaqueToken.generate().toString()),
    ).rejects.toBeInstanceOf(ResetLinkInvalidError);
  });

  it('CA-20: el token de un enlace de verificación no sirve para restablecer', async () => {
    const ctx = setup();
    const account = aClientUser().withId(randomUUID()).withEmail('beto@ejemplo.com').build();
    ctx.users.seed(account);
    await ctx.service.requestReset({ email: account.email.value });
    const verification = VERIFICATION_LINK.exec(ctx.sent[0]?.text ?? '')?.[1] ?? '';

    await expect(ctx.service.checkResetLink(verification)).rejects.toBeInstanceOf(
      ResetLinkInvalidError,
    );
  });

  it('CA-20: pasada 1 hora → `ResetLinkExpiredError`', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    ctx.clock.advance(RESET_TTL_MS);

    await expect(ctx.service.checkResetLink(value)).rejects.toBeInstanceOf(ResetLinkExpiredError);
    expect(ctx.logger.info).toHaveBeenLastCalledWith({
      event: 'identity.password_reset.rejected',
      reason: 'expired',
      userId: ctx.user.id,
    });
  });

  it('CA-20: un enlace reemplazado por otro más reciente → `ResetLinkInvalidError`', async () => {
    const ctx = setup();
    const replaced = await requestLinkFor(ctx, ctx.user);
    ctx.clock.advance(EMAIL_REQUEST_COOLDOWN_SECONDS * 1000);
    await requestLinkFor(ctx, ctx.user);

    await expect(ctx.service.checkResetLink(replaced)).rejects.toBeInstanceOf(
      ResetLinkInvalidError,
    );
  });

  it('CA-20: un enlace ya usado → `ResetLinkInvalidError`', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    await ctx.service.resetPassword({ token: value, password: NEW_PASSWORD });

    await expect(ctx.service.checkResetLink(value)).rejects.toBeInstanceOf(ResetLinkInvalidError);
  });

  it('CA-20: un enlace vigente se acepta sin consumirlo', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);

    await expect(ctx.service.checkResetLink(value)).resolves.toBeUndefined();
    await expect(ctx.service.checkResetLink(value)).resolves.toBeUndefined();
    expect(ctx.tokens.all()[0]?.usedAt).toBeNull();
  });
});

describe('PasswordService.resetPassword (plan 002 §6.3, CA-19 a CA-21)', () => {
  it.each([
    [
      'débil',
      'corta',
      [
        'PASSWORD_TOO_SHORT',
        'PASSWORD_MISSING_UPPERCASE',
        'PASSWORD_MISSING_NUMBER',
        'PASSWORD_MISSING_SYMBOL',
      ],
    ],
    ['igual a la parte local del correo', 'Nimbo-Seguro-2026', ['PASSWORD_EQUALS_EMAIL']],
  ])(
    'CA-21: contraseña %s → `IdentityWeakPasswordError` con `fields`, sin hash y el enlace sigue vigente',
    async (_case, password, reasons) => {
      const ctx = setup();
      const account = aClientUser()
        .withId(randomUUID())
        .withEmail('nimbo-seguro-2026@ejemplo.com')
        .verified()
        .build();
      ctx.users.seed(account);
      const value = await requestLinkFor(ctx, account);

      const attempt = ctx.service.resetPassword({ token: value, password });

      await expect(attempt).rejects.toBeInstanceOf(IdentityWeakPasswordError);
      const error = (await attempt.catch((caught: unknown) => caught)) as IdentityWeakPasswordError;
      expect(error.fields?.map((issue) => [issue.field, issue.reason])).toEqual(
        reasons.map((reason) => ['password', reason]),
      );
      expect(ctx.hasher.hash).not.toHaveBeenCalled();
      await expect(ctx.service.checkResetLink(value)).resolves.toBeUndefined();
      expect(ctx.logger.info).toHaveBeenCalledWith({
        event: 'identity.password_reset.rejected',
        reason: 'weak',
        userId: account.id,
      });
    },
  );

  it('CA-20: enlace vencido → `ResetLinkExpiredError` y la contraseña no cambia', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    ctx.clock.advance(RESET_TTL_MS + 1000);

    await expect(
      ctx.service.resetPassword({ token: value, password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ResetLinkExpiredError);
    expect(ctx.hasher.hash).not.toHaveBeenCalled();
    expect((await ctx.users.findById(ctx.user.id))?.passwordHash).toBe(ctx.user.passwordHash);
  });

  it('CA-20: si otro envío lo consumió antes (`consume` → `false`) → `ResetLinkInvalidError` sin cambiar nada', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    const session = await openSessionFor(ctx.sessions, ctx.user.id);
    jest.spyOn(ctx.tokens, 'consume').mockResolvedValueOnce(false);

    await expect(
      ctx.service.resetPassword({ token: value, password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ResetLinkInvalidError);
    expect((await ctx.users.findById(ctx.user.id))?.passwordHash).toBe(ctx.user.passwordHash);
    expect((await ctx.sessions.findByIdForUpdate(session.id))?.revocadaEn).toBeNull();
    expect(ctx.lockout.clear).not.toHaveBeenCalled();
    expect(ctx.sent.map((message) => message.tag)).toEqual([RESET_TAG]);
  });

  it('CA-19: cambia el hash (calculado fuera de la transacción), consume el enlace y revoca todas las sesiones', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    const sessions = [
      await openSessionFor(ctx.sessions, ctx.user.id),
      await openSessionFor(ctx.sessions, ctx.user.id),
    ];
    ctx.timeline.length = 0;

    await expect(
      ctx.service.resetPassword({ token: value, password: NEW_PASSWORD }),
    ).resolves.toBeUndefined();

    expect((await ctx.users.findById(ctx.user.id))?.passwordHash.reveal()).toBe(
      `fake$${NEW_PASSWORD}`,
    );
    expect(ctx.tokens.all()[0]?.usedAt).toEqual(NOW);
    for (const session of sessions) {
      expect((await ctx.sessions.findByIdForUpdate(session.id))?.revocadaEn).toEqual(NOW);
    }
    expect(ctx.sessions.all()).toHaveLength(2);
    expect(ctx.timeline.indexOf('hash')).toBeLessThan(ctx.timeline.indexOf('commit'));
  });

  it('CA-19, CA-5: después del commit quita los dos bloqueos, avisa por correo y registra `completed`', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    await openSessionFor(ctx.sessions, ctx.user.id);
    ctx.timeline.length = 0;
    ctx.logger.info.mockClear();

    await ctx.service.resetPassword({ token: value, password: NEW_PASSWORD });

    const loginKey = `identity:lockout:login:${sha256(ctx.user.email.value)}`;
    const changeKey = `identity:lockout:password-change:${ctx.user.id}`;
    expect(ctx.timeline).toEqual([
      'hash',
      'commit',
      `clear:${loginKey}`,
      `clear:${changeKey}`,
      `mail:${CHANGED_TAG}`,
    ]);
    const mail = ctx.sent.at(-1);
    expect(mail).toMatchObject({
      to: ctx.user.email.value,
      subject: 'Tu contraseña de Nimbo cambió',
      tag: CHANGED_TAG,
      recipientId: ctx.user.id,
    });
    expect(mail?.idempotencyKey).toMatch(new RegExp(`^${CHANGED_TAG}\\.[0-9a-f-]{36}$`));
    expect(mail?.text).toContain('http://localhost/recuperar-contrasena');
    expect(loggedEvents(ctx.logger)).toEqual([
      {
        event: 'identity.session.revoked',
        userId: ctx.user.id,
        reason: 'password_reset',
        count: 1,
      },
      { event: 'identity.password_reset.completed', userId: ctx.user.id, revokedCount: 1 },
    ]);
  });

  it('CA-19: sin sesiones abiertas no registra revocaciones y `revokedCount` es 0', async () => {
    const ctx = setup();
    const value = await requestLinkFor(ctx, ctx.user);
    ctx.logger.info.mockClear();

    await ctx.service.resetPassword({ token: value, password: NEW_PASSWORD });

    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_reset.completed', userId: ctx.user.id, revokedCount: 0 },
    ]);
  });

  it('CA-18, DT-6: una cuenta interna también restablece su contraseña', async () => {
    const ctx = setup();
    const internal = anInternalUser();
    ctx.users.seed(internal);
    const value = await requestLinkFor(ctx, internal);

    await ctx.service.resetPassword({ token: value, password: NEW_PASSWORD });

    const updated = await ctx.users.findById(internal.id);
    expect(updated).toBeInstanceOf(InternalUser);
    expect(updated?.passwordHash.reveal()).toBe(`fake$${NEW_PASSWORD}`);
  });

  it('011 RN-7: restablecer invalida la invitación de alta pendiente de la cuenta interna', async () => {
    const ctx = setup();
    const internal = anInternalUser();
    ctx.users.seed(internal);
    const invitation = aPendingInvitation(internal.id);
    await ctx.tokens.insert(invitation);
    const value = await requestLinkFor(ctx, internal);

    await ctx.service.resetPassword({ token: value, password: NEW_PASSWORD });

    const stored = ctx.tokens.all().find((token) => token.id === invitation.id);
    expect(stored?.invalidatedAt).toEqual(NOW);
  });

  it('011 RN-7: si otro envío consumió el enlace antes, la invitación de alta sigue intacta', async () => {
    const ctx = setup();
    const internal = anInternalUser();
    ctx.users.seed(internal);
    const invitation = aPendingInvitation(internal.id);
    await ctx.tokens.insert(invitation);
    const value = await requestLinkFor(ctx, internal);
    jest.spyOn(ctx.tokens, 'consume').mockResolvedValueOnce(false);

    await expect(
      ctx.service.resetPassword({ token: value, password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ResetLinkInvalidError);
    const stored = ctx.tokens.all().find((token) => token.id === invitation.id);
    expect(stored?.invalidatedAt).toBeNull();
  });
});

describe('PasswordService.changePassword (plan 002 §6.3, CA-22, CA-23)', () => {
  const SECONDS_PER_MINUTE = 60;
  const CHANGE_POLICY: LockoutPolicy = {
    maxFailures: PASSWORD_CHANGE_MAX_FAILURES,
    windowSeconds: PASSWORD_CHANGE_WINDOW_MINUTES * SECONDS_PER_MINUTE,
    lockSeconds: PASSWORD_CHANGE_LOCK_MINUTES * SECONDS_PER_MINUTE,
  };
  const CURRENT_PASSWORD = 'Nimbo-Seguro-2026';
  const changeKey = (userId: string): string => `identity:lockout:password-change:${userId}`;
  const command = { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD };

  /** Cliente con la sesión actual y otras dos abiertas en otros navegadores; la contraseña actual es correcta. */
  const signedIn = async () => {
    const ctx = setup();
    ctx.hasher.verify.mockResolvedValue(true);
    const current = await openSessionFor(ctx.sessions, ctx.user.id);
    const others = [
      await openSessionFor(ctx.sessions, ctx.user.id),
      await openSessionFor(ctx.sessions, ctx.user.id),
    ];
    return { ...ctx, actor: createActor(ctx.user.id, Role.CLIENT), current, others };
  };

  type SignedIn = Awaited<ReturnType<typeof signedIn>>;

  /** Nada cambió: mismo hash, ninguna sesión revocada ni correo. */
  const expectNothingChanged = async (ctx: SignedIn): Promise<void> => {
    expect(ctx.hasher.hash).not.toHaveBeenCalled();
    expect((await ctx.users.findById(ctx.user.id))?.passwordHash).toBe(ctx.user.passwordHash);
    expect(ctx.sessions.all().map((session) => session.revocadaEn)).toEqual([null, null, null]);
    expect(ctx.sent).toEqual([]);
  };

  it('CA-23: bloqueado → `PasswordChangeLockedError` con los segundos que faltan aunque la actual sea correcta', async () => {
    const ctx = await signedIn();
    ctx.lockout.reserveAttempt.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 600 });

    const attempt = ctx.service.changePassword(ctx.actor, ctx.current.id, command);

    await expect(attempt).rejects.toBeInstanceOf(PasswordChangeLockedError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 600 });
    expect(ctx.lockout.reserveAttempt).toHaveBeenCalledWith(changeKey(ctx.user.id), CHANGE_POLICY);
    expect(ctx.hasher.verify).not.toHaveBeenCalled();
    expect(ctx.lockout.clear).not.toHaveBeenCalled();
    await expectNothingChanged(ctx);
    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_change.rejected', reason: 'locked', userId: ctx.user.id },
    ]);
  });

  it('CA-23, I-1: actual incorrecta → el intento se reservó como fallo antes de verificar, no se libera y `WrongPasswordError`; nada cambia', async () => {
    const ctx = await signedIn();
    ctx.hasher.verify.mockResolvedValue(false);

    await expect(
      ctx.service.changePassword(ctx.actor, ctx.current.id, command),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(ctx.lockout.reserveAttempt).toHaveBeenCalledWith(changeKey(ctx.user.id), CHANGE_POLICY);
    expect(ctx.lockout.reserveAttempt.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.hasher.verify.mock.invocationCallOrder[0] ?? 0,
    );
    expect(ctx.hasher.verify).toHaveBeenCalledWith(ctx.user.passwordHash, CURRENT_PASSWORD);
    expect(ctx.lockout.recordFailure).not.toHaveBeenCalled();
    expect(ctx.lockout.clear).not.toHaveBeenCalled();
    await expectNothingChanged(ctx);
    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password_change.rejected', reason: 'wrong_password', userId: ctx.user.id },
    ]);
  });

  it('CA-23: el fallo que activa el bloqueo todavía responde `WrongPasswordError` y registra `lockout.engaged`', async () => {
    const ctx = await signedIn();
    ctx.hasher.verify.mockResolvedValue(false);
    ctx.lockout.reserveAttempt.mockResolvedValueOnce({ allowed: true, engagedLock: true });

    await expect(
      ctx.service.changePassword(ctx.actor, ctx.current.id, command),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(ctx.logger.warn).toHaveBeenCalledWith({
      event: 'identity.lockout.engaged',
      scope: 'password_change',
      userId: ctx.user.id,
    });
  });

  it.each([
    ['vacía', '', 'PASSWORD_TOO_SHORT'],
    ['débil', 'corta', 'PASSWORD_MISSING_UPPERCASE'],
    ['igual a la parte local del correo', 'ANA', 'PASSWORD_EQUALS_EMAIL'],
  ])(
    'CA-22: nueva %s → `IdentityWeakPasswordError` sobre `newPassword`, libera la reserva, sin hash y nada cambia',
    async (_case, newPassword, reason) => {
      const ctx = await signedIn();

      const attempt = ctx.service.changePassword(ctx.actor, ctx.current.id, {
        currentPassword: CURRENT_PASSWORD,
        newPassword,
      });

      await expect(attempt).rejects.toBeInstanceOf(IdentityWeakPasswordError);
      const error = (await attempt.catch((caught: unknown) => caught)) as IdentityWeakPasswordError;
      expect(error.fields?.every((issue) => issue.field === 'newPassword')).toBe(true);
      expect(error.fields?.map((issue) => issue.reason)).toContain(reason);
      expect(ctx.lockout.clear).toHaveBeenCalledWith(changeKey(ctx.user.id));
      await expectNothingChanged(ctx);
      expect(loggedEvents(ctx.logger)).toEqual([
        { event: 'identity.password_change.rejected', reason: 'weak', userId: ctx.user.id },
      ]);
    },
  );

  it('CA-22: cambia el hash (calculado fuera de la transacción) y revoca las otras sesiones, nunca la actual', async () => {
    const ctx = await signedIn();

    await expect(
      ctx.service.changePassword(ctx.actor, ctx.current.id, command),
    ).resolves.toBeUndefined();

    expect((await ctx.users.findById(ctx.user.id))?.passwordHash.reveal()).toBe(
      `fake$${NEW_PASSWORD}`,
    );
    expect((await ctx.sessions.findByIdForUpdate(ctx.current.id))?.revocadaEn).toBeNull();
    for (const session of ctx.others) {
      expect((await ctx.sessions.findByIdForUpdate(session.id))?.revocadaEn).toEqual(NOW);
    }
    expect(ctx.timeline.indexOf('hash')).toBeLessThan(ctx.timeline.indexOf('commit'));
  });

  it('CA-22, I-1: la actual correcta libera la reserva antes del hash; después del commit registra y avisa «Tu contraseña cambió»', async () => {
    const ctx = await signedIn();

    await ctx.service.changePassword(ctx.actor, ctx.current.id, command);

    expect(ctx.timeline).toEqual([
      `clear:${changeKey(ctx.user.id)}`,
      'hash',
      'commit',
      `mail:${CHANGED_TAG}`,
    ]);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]).toMatchObject({
      to: ctx.user.email.value,
      subject: 'Tu contraseña de Nimbo cambió',
      tag: CHANGED_TAG,
      recipientId: ctx.user.id,
    });
    expect(ctx.sent[0]?.idempotencyKey).toMatch(new RegExp(`^${CHANGED_TAG}\\.[0-9a-f-]{36}$`));
    expect(loggedEvents(ctx.logger)).toEqual([
      {
        event: 'identity.session.revoked',
        userId: ctx.user.id,
        reason: 'password_change',
        count: 2,
      },
      { event: 'identity.password.changed', userId: ctx.user.id, revokedCount: 2 },
    ]);
  });

  it('CA-22: sin otras sesiones no registra revocaciones y `revokedCount` es 0', async () => {
    const ctx = setup();
    ctx.hasher.verify.mockResolvedValue(true);
    const current = await openSessionFor(ctx.sessions, ctx.user.id);

    await ctx.service.changePassword(createActor(ctx.user.id, Role.CLIENT), current.id, command);

    expect(loggedEvents(ctx.logger)).toEqual([
      { event: 'identity.password.changed', userId: ctx.user.id, revokedCount: 0 },
    ]);
  });

  it('CA-22: un rol interno también cambia la suya', async () => {
    const ctx = setup();
    ctx.hasher.verify.mockResolvedValue(true);
    const internal = anInternalUser();
    ctx.users.seed(internal);
    const current = await openSessionFor(ctx.sessions, internal.id);

    await ctx.service.changePassword(createActor(internal.id, Role.SUPPORT), current.id, command);

    const updated = await ctx.users.findById(internal.id);
    expect(updated).toBeInstanceOf(InternalUser);
    expect(updated?.passwordHash.reveal()).toBe(`fake$${NEW_PASSWORD}`);
  });
});
