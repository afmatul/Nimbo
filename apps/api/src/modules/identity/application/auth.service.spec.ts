import { createHash } from 'node:crypto';

import {
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
} from '@nimbo/contracts';

import { InvalidCredentialsError, LoginLockedError } from '../domain/errors';
import { PasswordHash } from '../domain/password-hash.vo';

import { AuthService } from './auth.service';
import type { ClientContext } from './client-context';
import type { IAttemptLockout, LockoutPolicy, LockState } from './ports/i-attempt-lockout.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import type { OpenedSession } from './session.service';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

const EMAIL = 'ana@ejemplo.com';
const PASSWORD = 'Nimbo-Seguro-2026';
const UNLOCKED: LockState = { locked: false };
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
