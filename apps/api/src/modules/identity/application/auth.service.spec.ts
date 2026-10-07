import { createHash } from 'node:crypto';

import {
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  SUPPORT_CONTACT_EMAIL,
} from '@nimbo/contracts';

import {
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  LoginLockedError,
} from '../domain/errors';
import { PasswordHash } from '../domain/password-hash.vo';

import { AuthService } from './auth.service';
import type { ClientContext } from './client-context';
import type {
  AttemptReservation,
  IAttemptLockout,
  LockoutPolicy,
  LockState,
} from './ports/i-attempt-lockout.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import type { OpenedSession } from './session.service';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

const EMAIL = 'ana@ejemplo.com';
const PASSWORD = 'Nimbo-Seguro-2026';
const UNLOCKED: LockState = { locked: false };
const RESERVED: AttemptReservation = { allowed: true, engagedLock: false };
const LOGIN_POLICY = {
  maxFailures: LOGIN_MAX_FAILURES,
  windowSeconds: LOGIN_FAILURE_WINDOW_MINUTES * 60,
  lockSeconds: LOGIN_LOCK_MINUTES * 60,
};
const CLIENT: ClientContext = { userAgent: 'Mozilla/5.0', ip: '203.0.113.7' };
const loginKey = (email: string): string =>
  `identity:lockout:login:${createHash('sha256').update(email).digest('hex')}`;

const fakeHasher = (): jest.Mocked<IPasswordHasher> => ({
  hash: jest.fn((plain: string) => Promise.resolve(PasswordHash.fromPhc(`fake$${plain}`))),
  verify: jest.fn((hash: PasswordHash, plain: string) =>
    Promise.resolve(hash.reveal() === `fake$${plain}`),
  ),
});

const setup = async () => {
  const users = new InMemoryUserRepository();
  const hasher = fakeHasher();
  const lockout: jest.Mocked<IAttemptLockout> = {
    check: jest.fn((_key: string) => Promise.resolve(UNLOCKED)),
    recordFailure: jest.fn((_key: string, _policy: LockoutPolicy) => Promise.resolve(UNLOCKED)),
    reserveAttempt: jest.fn((_key: string, _policy: LockoutPolicy) => Promise.resolve(RESERVED)),
    clear: jest.fn((_key: string) => Promise.resolve()),
  };
  const opened = { sessionId: 'sesion-1', newDevice: true } as OpenedSession;
  const sessions = { open: jest.fn(() => Promise.resolve(opened)) };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const service = new AuthService(users, hasher, lockout, sessions, logger);
  await service.onModuleInit();
  const findByEmail = jest.spyOn(users, 'findByEmail');
  return { service, users, hasher, lockout, sessions, logger, opened, findByEmail };
};

type Setup = Awaited<ReturnType<typeof setup>>;

const loggedEvents = (logger: Setup['logger']): unknown[] =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(([payload]) => payload);

const activeUser = () => aClientUser().withPasswordHash(`fake$${PASSWORD}`).verified();

describe('AuthService.login: bloqueo y credenciales inválidas (plan 002 §6.3)', () => {
  it('CA-5: con el correo bloqueado responde `LOGIN_LOCKED` sin buscar la cuenta', async () => {
    const ctx = await setup();
    ctx.lockout.check.mockResolvedValue({ locked: true, retryAfterSeconds: 600 });

    const error = await ctx.service
      .login({ email: EMAIL, password: PASSWORD }, CLIENT)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LoginLockedError);
    expect((error as LoginLockedError).retryAfterSeconds).toBe(600);
    expect(ctx.findByEmail).not.toHaveBeenCalled();
    expect(ctx.hasher.verify).not.toHaveBeenCalled();
    expect(ctx.logger.warn).toHaveBeenCalledWith({
      event: 'identity.login.locked',
      retryAfterSeconds: 600,
    });
  });

  it('CA-5: la clave del bloqueo es el SHA-256 del correo normalizado, nunca el correo', async () => {
    const ctx = await setup();

    await ctx.service
      .login({ email: '  Ana@Ejemplo.COM ', password: PASSWORD }, CLIENT)
      .catch(() => undefined);

    expect(ctx.lockout.check).toHaveBeenCalledWith(loginKey(EMAIL));
  });

  it('CA-2: con un correo inexistente igual calcula Argon2id con el hash señuelo y cuenta el fallo', async () => {
    const ctx = await setup();
    const dummy = await (ctx.hasher.hash.mock.results[0]?.value as Promise<PasswordHash>);

    await expect(
      ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(ctx.hasher.verify).toHaveBeenCalledTimes(1);
    expect(ctx.hasher.verify).toHaveBeenCalledWith(dummy, PASSWORD);
    expect(ctx.lockout.recordFailure).toHaveBeenCalledWith(loginKey(EMAIL), LOGIN_POLICY);
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.login.failed',
      reason: 'invalid_credentials',
    });
  });

  it('CA-2: con la contraseña incorrecta cuenta el fallo y responde lo mismo', async () => {
    const ctx = await setup();
    const user = activeUser().build();
    ctx.users.seed(user);

    await expect(
      ctx.service.login({ email: EMAIL, password: 'otra-contraseña' }, CLIENT),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(ctx.lockout.recordFailure).toHaveBeenCalledWith(loginKey(EMAIL), LOGIN_POLICY);
    expect(ctx.sessions.open).not.toHaveBeenCalled();
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.login.failed',
      reason: 'invalid_credentials',
      userId: user.id,
    });
  });

  it('CA-5: el fallo que activa el bloqueo sigue respondiendo credenciales inválidas', async () => {
    const ctx = await setup();
    const user = activeUser().build();
    ctx.users.seed(user);
    ctx.lockout.recordFailure.mockResolvedValue({ locked: true, retryAfterSeconds: 900 });

    await expect(
      ctx.service.login({ email: EMAIL, password: 'otra-contraseña' }, CLIENT),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(ctx.logger.warn).toHaveBeenCalledWith({
      event: 'identity.lockout.engaged',
      scope: 'login',
      userId: user.id,
    });
  });

  it('CA-2: el hash señuelo se calcula una sola vez al iniciar el módulo', async () => {
    const ctx = await setup();

    await ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT).catch(() => undefined);
    await ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT).catch(() => undefined);

    expect(ctx.hasher.hash).toHaveBeenCalledTimes(1);
    const dummy = await (ctx.hasher.hash.mock.results[0]?.value as Promise<PasswordHash>);
    expect(ctx.hasher.verify.mock.calls.every(([hash]) => hash === dummy)).toBe(true);
  });
});

describe('AuthService.login: estados de la cuenta y éxito (plan 002 §6.3)', () => {
  it('CA-4: contraseña correcta de una cuenta suspendida responde `ACCOUNT_SUSPENDED` sin contar fallo', async () => {
    const ctx = await setup();
    const user = activeUser().suspended().build();
    ctx.users.seed(user);

    const error = await ctx.service
      .login({ email: EMAIL, password: PASSWORD }, CLIENT)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AccountSuspendedError);
    expect((error as AccountSuspendedError).message).toContain(SUPPORT_CONTACT_EMAIL);
    expect(ctx.lockout.recordFailure).not.toHaveBeenCalled();
    expect(ctx.sessions.open).not.toHaveBeenCalled();
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.login.failed',
      reason: 'account_suspended',
      userId: user.id,
    });
  });

  it('CA-3: contraseña correcta de una cuenta sin verificar responde `EMAIL_NOT_VERIFIED` sin contar fallo', async () => {
    const ctx = await setup();
    const user = aClientUser().withPasswordHash(`fake$${PASSWORD}`).build();
    ctx.users.seed(user);

    await expect(
      ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT),
    ).rejects.toBeInstanceOf(EmailNotVerifiedError);

    expect(ctx.lockout.recordFailure).not.toHaveBeenCalled();
    expect(ctx.sessions.open).not.toHaveBeenCalled();
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.login.failed',
      reason: 'email_not_verified',
      userId: user.id,
    });
  });

  it('CA-1: con la cuenta activa borra los fallos y abre la sesión de inicio de sesión', async () => {
    const ctx = await setup();
    const user = activeUser().build();
    ctx.users.seed(user);

    const result = await ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT);

    expect(result).toBe(ctx.opened);
    expect(ctx.lockout.clear).toHaveBeenCalledWith(loginKey(EMAIL));
    expect(ctx.sessions.open).toHaveBeenCalledWith(user, CLIENT, 'login');
    expect(ctx.lockout.recordFailure).not.toHaveBeenCalled();
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.login.succeeded',
      userId: user.id,
      sessionId: ctx.opened.sessionId,
      newDevice: true,
    });
  });

  it('CA-25: ninguna bitácora del inicio de sesión lleva el correo ni la contraseña', async () => {
    const ctx = await setup();
    ctx.users.seed(activeUser().build());

    await ctx.service.login({ email: EMAIL, password: 'mala' }, CLIENT).catch(() => undefined);
    await ctx.service
      .login({ email: 'otra@ejemplo.com', password: 'mala' }, CLIENT)
      .catch(() => undefined);
    await ctx.service.login({ email: EMAIL, password: PASSWORD }, CLIENT);

    const logged = JSON.stringify(loggedEvents(ctx.logger));
    expect(logged).not.toContain('@');
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain('mala');
  });
});
