import { randomUUID } from 'node:crypto';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_ROTATION_GRACE_SECONDS,
  SESSION_IDLE_TIMEOUT_DAYS,
  SESSION_LIST_MAX_ITEMS,
  SESSION_MAX_LIFETIME_DAYS,
  sessionSummarySchema,
} from '@nimbo/contracts';

import { createActor } from '../../../shared/domain/actor';
import { FixedClock } from '../../../shared/domain/fixed.clock';
import { Role } from '../../../shared/domain/role.enum';
import type { MailMessage } from '../../notifications';
import {
  RefreshInvalidError,
  SessionExpiredError,
  SessionNotFoundError,
  SessionRevokedError,
} from '../domain/errors';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { RefreshToken } from '../domain/refresh-token.vo';
import { Session } from '../domain/session.entity';

import type { ClientContext } from './client-context';
import type { IssueAccessTokenInput } from './ports/i-token-service.port';
import { SessionService } from './session.service';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryDeviceRepository } from './testing/in-memory-device.repository';
import { InMemorySessionRepository } from './testing/in-memory-session.repository';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { RecordingTransactionRunner } from './testing/recording-transaction-runner';

const NOW = new Date('2026-09-30T15:00:00.000Z');
const MS_PER_DAY = 86_400_000;
const IDLE_MS = SESSION_IDLE_TIMEOUT_DAYS * MS_PER_DAY;
const MAX_LIFETIME_MS = SESSION_MAX_LIFETIME_DAYS * MS_PER_DAY;
const GRACE_MS = REFRESH_ROTATION_GRACE_SECONDS * 1000;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const DEVICE_SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';

const client = (overrides: Partial<ClientContext> = {}): ClientContext => ({
  userAgent: FIREFOX_LINUX,
  ip: '203.0.113.7',
  ...overrides,
});

const setup = () => {
  const timeline: string[] = [];
  const clock = new FixedClock(NOW);
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const devices = new InMemoryDeviceRepository();
  const sent: MailMessage[] = [];
  const mailer = {
    send: jest.fn((message: MailMessage) => {
      timeline.push(`mail:${message.tag}`);
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const tokens = {
    issueAccessToken: jest.fn((input: IssueAccessTokenInput) => {
      timeline.push('access-token');
      return Promise.resolve({
        token: `access.${input.sessionId}`,
        expiresAt: new Date(clock.now().getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      });
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const service = new SessionService(
    sessions,
    devices,
    users,
    tokens,
    mailer,
    new RecordingTransactionRunner(timeline),
    clock,
    { webPublicUrl: 'http://localhost/', cookieSecure: false },
    logger,
  );
  const user = aClientUser().verified().build();
  users.seed(user);
  return { service, clock, users, sessions, devices, mailer, sent, tokens, logger, timeline, user };
};

type Setup = ReturnType<typeof setup>;

const loggedEvents = (logger: Setup['logger']): unknown[] =>
  [...logger.info.mock.calls, ...logger.warn.mock.calls].map(([payload]) => payload);

describe('SessionService.open (plan 002 §6.3)', () => {
  it('CA-1: devuelve el token de acceso, el de refresco, su vida y el usuario de la respuesta', async () => {
    const { service, user, sessions } = setup();

    const opened = await service.open(user, client(), 'login');

    const [session] = sessions.all();
    expect(session).toBeDefined();
    expect(opened.sessionId).toBe(session?.id);
    expect(opened.access).toEqual({
      token: `access.${opened.sessionId}`,
      expiresAt: new Date(NOW.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    });
    expect(RefreshToken.parse(opened.refreshToken)?.sessionId).toBe(opened.sessionId);
    expect(opened.refreshMaxAge).toBe(IDLE_MS);
    expect(opened.user).toEqual({
      id: user.id,
      fullName: user.fullName,
      email: user.email.value,
      role: Role.CLIENT,
    });
  });

  it('CA-1: el token de acceso se emite fuera de la transacción, después del commit', async () => {
    const { service, user, tokens, timeline } = setup();

    await service.open(user, client(), 'verification');

    expect(tokens.issueAccessToken).toHaveBeenCalledWith({
      userId: user.id,
      role: Role.CLIENT,
      sessionId: expect.any(String) as string,
    });
    expect(timeline).toEqual(['commit', 'access-token']);
  });

  it('CA-17: sin cookie de dispositivo genera una y guarda solo hashes', async () => {
    const { service, user, sessions, devices } = setup();

    const opened = await service.open(user, client(), 'login');

    expect(opened.deviceCookie).toBeDefined();
    const deviceCookie = opened.deviceCookie ?? '';
    expect(OpaqueToken.isWellFormed(deviceCookie)).toBe(true);
    const [device] = devices.all();
    expect(device?.secretHash).toBe(OpaqueToken.hashOf(deviceCookie));
    const [session] = sessions.all();
    expect(session?.refreshHash).toBe(RefreshToken.parse(opened.refreshToken)?.secretHash);
    expect(session?.deviceId).toBe(device?.id);
    expect(JSON.stringify({ device, session })).not.toContain(deviceCookie);
  });

  it('CA-17: con una cookie de dispositivo mal formada genera otra', async () => {
    const { service, user } = setup();

    const opened = await service.open(user, client({ deviceSecret: 'corta' }), 'login');

    expect(opened.deviceCookie).toBeDefined();
    expect(opened.deviceCookie).not.toBe('corta');
  });

  it('CA-17: con una cookie de dispositivo válida no la cambia', async () => {
    const { service, user, devices } = setup();

    const opened = await service.open(user, client({ deviceSecret: DEVICE_SECRET }), 'login');

    expect(opened.deviceCookie).toBeUndefined();
    expect(devices.all()[0]?.secretHash).toBe(OpaqueToken.hashOf(DEVICE_SECRET));
  });

  it('CA-16: un dispositivo nuevo al iniciar sesión recibe el aviso después del commit', async () => {
    const { service, user, sent, timeline, logger, devices } = setup();

    const opened = await service.open(user, client(), 'login');

    expect(opened.newDevice).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: user.email.value,
      subject: 'Nuevo inicio de sesión en Nimbo',
      idempotencyKey: `identity.new-device.${opened.sessionId}`,
      tag: 'identity.new-device',
      recipientId: user.id,
    });
    expect(sent[0]?.text).toContain('desde Firefox en Linux');
    expect(sent[0]?.text).toContain('http://localhost/cuenta/seguridad');
    expect(timeline.indexOf('commit')).toBeLessThan(timeline.indexOf('mail:identity.new-device'));
    expect(loggedEvents(logger)).toContainEqual({
      event: 'identity.device.new',
      userId: user.id,
      deviceId: devices.all()[0]?.id,
    });
  });

  it('CA-16: desde un dispositivo ya conocido no hay aviso', async () => {
    const { service, user, sent } = setup();
    await service.open(user, client({ deviceSecret: DEVICE_SECRET }), 'login');
    sent.length = 0;

    const opened = await service.open(user, client({ deviceSecret: DEVICE_SECRET }), 'login');

    expect(opened.newDevice).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('CA-15: la sesión que abre la verificación deja el dispositivo conocido sin aviso (D-4)', async () => {
    const { service, user, sent, devices } = setup();

    const opened = await service.open(user, client(), 'verification');

    expect(sent).toHaveLength(0);
    expect(devices.all()).toHaveLength(1);
    const again = await service.open(
      user,
      client({ deviceSecret: opened.deviceCookie ?? '' }),
      'login',
    );
    expect(again.newDevice).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

const UNKNOWN_SESSION_ID = '9d2f1c7a-3b4e-4f5a-8b6c-7d8e9f0a1b2c';

/** Abre una sesión real con el servicio y limpia las anotaciones para medir solo lo que sigue. */
const openSession = async (ctx: Setup) => {
  const opened = await ctx.service.open(
    ctx.user,
    client({ deviceSecret: DEVICE_SECRET }),
    'verification',
  );
  ctx.timeline.length = 0;
  ctx.sent.length = 0;
  ctx.logger.info.mockClear();
  ctx.logger.warn.mockClear();
  ctx.tokens.issueAccessToken.mockClear();
  return opened;
};

const stored = (ctx: Setup, sessionId: string): Session => {
  const session = ctx.sessions.get(sessionId);
  if (session === undefined) {
    throw new Error('La sesión de la prueba no existe.');
  }
  return session;
};

/** Rota la sesión guardada como lo haría otra renovación y devuelve el token vigente. */
const rotateStored = async (ctx: Setup, sessionId: string, at: Date): Promise<string> => {
  const next = RefreshToken.issue(sessionId);
  await ctx.sessions.update(stored(ctx, sessionId).rotate(next.secretHash, at));
  return next.value;
};

/** Línea `identity.session.revoked` del dueño de la prueba (plan §7). */
const revokedBy = (ctx: Setup, fields: Record<string, unknown>) => ({
  event: 'identity.session.revoked',
  userId: ctx.user.id,
  ...fields,
});

const rejection = (reason: string, sessionId?: string) => ({
  event: 'identity.session.refresh_rejected',
  reason,
  ...(sessionId === undefined ? {} : { sessionId }),
});

describe('SessionService.refresh: rechazos sin escritura (plan 002 §6.3)', () => {
  it('CA-9: un token mal formado se rechaza sin consultar el repositorio', async () => {
    const ctx = setup();

    await expect(ctx.service.refresh('basura', client())).rejects.toBeInstanceOf(
      RefreshInvalidError,
    );

    expect(ctx.sessions.findCalls).toBe(0);
    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('malformed'));
  });

  it('CA-9: un `sid` desconocido responde `REFRESH_INVALID`', async () => {
    const ctx = setup();

    await expect(
      ctx.service.refresh(RefreshToken.issue(UNKNOWN_SESSION_ID).value, client()),
    ).rejects.toBeInstanceOf(RefreshInvalidError);

    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('unknown'));
  });

  it('CA-10: una sesión revocada responde `SESSION_REVOKED` sin cambios', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    await ctx.sessions.update(stored(ctx, opened.sessionId).revoke(NOW));
    const before = stored(ctx, opened.sessionId);

    await expect(ctx.service.refresh(opened.refreshToken, client())).rejects.toBeInstanceOf(
      SessionRevokedError,
    );

    expect(stored(ctx, opened.sessionId)).toBe(before);
    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('revoked', opened.sessionId));
  });

  it('CA-8: vencida por 7 días sin uso responde `SESSION_EXPIRED` sin cambios', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    const before = stored(ctx, opened.sessionId);
    ctx.clock.advance(IDLE_MS);

    await expect(ctx.service.refresh(opened.refreshToken, client())).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    expect(stored(ctx, opened.sessionId)).toBe(before);
    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('expired', opened.sessionId));
    expect(ctx.tokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it('CA-8: vencida por los 30 días de vida aunque se haya usado el día anterior', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    const current = await rotateStored(
      ctx,
      opened.sessionId,
      new Date(NOW.getTime() + MAX_LIFETIME_MS - MS_PER_DAY),
    );
    ctx.clock.set(new Date(NOW.getTime() + MAX_LIFETIME_MS));

    await expect(ctx.service.refresh(current, client())).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('CA-9: el token anterior dentro de la gracia responde `REFRESH_INVALID` sin revocar', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    await rotateStored(ctx, opened.sessionId, NOW);
    const before = stored(ctx, opened.sessionId);
    ctx.clock.advance(GRACE_MS);

    await expect(ctx.service.refresh(opened.refreshToken, client())).rejects.toBeInstanceOf(
      RefreshInvalidError,
    );

    expect(stored(ctx, opened.sessionId)).toBe(before);
    expect(before.revocadaEn).toBeNull();
    expect(ctx.sent).toHaveLength(0);
    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('grace', opened.sessionId));
  });
});

describe('SessionService.refresh: rotación, reúso y cuenta suspendida (plan 002 §6.3)', () => {
  it('CA-7: con el token vigente rota el secreto, actualiza el uso y emite credenciales nuevas', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    const before = stored(ctx, opened.sessionId);
    ctx.clock.advance(MS_PER_DAY);

    const refreshed = await ctx.service.refresh(opened.refreshToken, client());

    const after = stored(ctx, opened.sessionId);
    const parsed = RefreshToken.parse(refreshed.refreshToken);
    expect(refreshed.sessionId).toBe(opened.sessionId);
    expect(refreshed.refreshToken).not.toBe(opened.refreshToken);
    expect(parsed?.sessionId).toBe(opened.sessionId);
    expect(after.refreshHash).toBe(parsed?.secretHash);
    expect(after.refreshAnteriorHash).toBe(before.refreshHash);
    expect(after.ultimoUso).toEqual(ctx.clock.now());
    expect(refreshed.refreshMaxAge).toBe(IDLE_MS);
    expect(refreshed.user.id).toBe(ctx.user.id);
    expect(refreshed.access.token).toBe(`access.${opened.sessionId}`);
    expect(ctx.timeline).toEqual(['commit', 'access-token']);
    expect(loggedEvents(ctx.logger)).toContainEqual({
      event: 'identity.session.refreshed',
      userId: ctx.user.id,
      sessionId: opened.sessionId,
    });
  });

  it('CA-8: la cookie nueva no dura más de lo que le queda a la sesión', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    ctx.clock.advance(MAX_LIFETIME_MS - MS_PER_DAY / 2);
    const current = await rotateStored(ctx, opened.sessionId, ctx.clock.now());

    const refreshed = await ctx.service.refresh(current, client());

    expect(refreshed.refreshMaxAge).toBe(MS_PER_DAY / 2);
  });

  it('CA-9: el reúso de un token rotado revoca, confirma y después lanza, con aviso al dueño', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    await rotateStored(ctx, opened.sessionId, NOW);
    ctx.clock.advance(GRACE_MS + 1);

    await expect(ctx.service.refresh(opened.refreshToken, client())).rejects.toBeInstanceOf(
      SessionRevokedError,
    );

    expect(stored(ctx, opened.sessionId).revocadaEn).toEqual(ctx.clock.now());
    expect(ctx.timeline).toEqual(['commit', 'mail:identity.session-revoked']);
    expect(ctx.sent[0]).toMatchObject({
      to: ctx.user.email.value,
      subject: 'Cerramos una sesión por seguridad',
      idempotencyKey: `identity.session-revoked.${opened.sessionId}`,
      tag: 'identity.session-revoked',
      recipientId: ctx.user.id,
    });
    expect(ctx.sent[0]?.text).toContain('(Firefox · Linux)');
    expect(ctx.logger.warn).toHaveBeenCalledWith({
      event: 'identity.session.reuse_detected',
      userId: ctx.user.id,
      sessionId: opened.sessionId,
    });
    expect(ctx.logger.info).toHaveBeenCalledWith(
      revokedBy(ctx, { sessionId: opened.sessionId, reason: 'reuse', count: 1 }),
    );
    expect(ctx.tokens.issueAccessToken).not.toHaveBeenCalled();
  });

  it('CA-9: un secreto falsificado con un `sid` conocido también revoca la sesión', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    const forged = RefreshToken.issue(opened.sessionId).value;

    await expect(ctx.service.refresh(forged, client())).rejects.toBeInstanceOf(SessionRevokedError);

    expect(stored(ctx, opened.sessionId).revocadaEn).not.toBeNull();
  });

  it('CA-10: con la cuenta suspendida revoca, confirma y lanza `SESSION_REVOKED`', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    ctx.users.seed(aClientUser().verified().suspended().build());

    await expect(ctx.service.refresh(opened.refreshToken, client())).rejects.toBeInstanceOf(
      SessionRevokedError,
    );

    expect(stored(ctx, opened.sessionId).revocadaEn).toEqual(NOW);
    expect(ctx.timeline).toEqual(['commit']);
    expect(ctx.sent).toHaveLength(0);
    expect(loggedEvents(ctx.logger)).toContainEqual(rejection('suspended', opened.sessionId));
    expect(loggedEvents(ctx.logger)).toContainEqual(
      revokedBy(ctx, { sessionId: opened.sessionId, reason: 'suspended', count: 1 }),
    );
  });
});

describe('SessionService.logout (plan 002 §6.3)', () => {
  const revokedLog = (ctx: Setup, sessionId: string) =>
    revokedBy(ctx, { sessionId, reason: 'logout', count: 1 });

  it('CA-14: con el token vigente revoca la sesión', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);

    await ctx.service.logout(opened.refreshToken);

    expect(stored(ctx, opened.sessionId).revocadaEn).toEqual(NOW);
    expect(ctx.timeline).toEqual(['commit']);
    expect(loggedEvents(ctx.logger)).toContainEqual(revokedLog(ctx, opened.sessionId));
  });

  it('CA-14: con el token anterior dentro de la gracia también la revoca', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    await rotateStored(ctx, opened.sessionId, NOW);

    await ctx.service.logout(opened.refreshToken);

    expect(stored(ctx, opened.sessionId).revocadaEn).toEqual(NOW);
  });

  it('CA-14: mal formado, desconocido, reusado o ya revocado no hace nada ni lanza', async () => {
    const ctx = setup();
    const opened = await openSession(ctx);
    const current = await rotateStored(ctx, opened.sessionId, NOW);
    ctx.clock.advance(GRACE_MS + 1);
    const before = stored(ctx, opened.sessionId);

    await ctx.service.logout('basura');
    await ctx.service.logout(RefreshToken.issue(UNKNOWN_SESSION_ID).value);
    await ctx.service.logout(opened.refreshToken);

    expect(stored(ctx, opened.sessionId)).toBe(before);
    await ctx.sessions.update(before.revoke(NOW));
    const revoked = stored(ctx, opened.sessionId);
    await ctx.service.logout(current);
    expect(stored(ctx, opened.sessionId)).toBe(revoked);
    expect(ctx.sent).toHaveLength(0);
    expect(ctx.logger.info).not.toHaveBeenCalled();
    expect(ctx.logger.warn).not.toHaveBeenCalled();
  });
});

const OTHER_USER_ID = '5b0e7c2d-9a41-4c6e-8f3b-2d1a0e9c8b7a';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

interface SeededSession {
  readonly userId: string;
  readonly userAgent: string;
  /** Minutos antes de `NOW` del último uso. */
  readonly idleMinutes: number;
}

/** Deja una sesión abierta hace un día y usada por última vez `idleMinutes` antes de `NOW`. */
const seedSession = (ctx: Setup, seeded: SeededSession): Session => {
  const opened = Session.open({
    id: randomUUID(),
    userId: seeded.userId,
    deviceId: randomUUID(),
    secretHash: RefreshToken.issue(randomUUID()).secretHash,
    now: new Date(NOW.getTime() - MS_PER_DAY),
    maxLifetime: MAX_LIFETIME_MS,
  });
  const session = opened.rotate(
    RefreshToken.issue(opened.id).secretHash,
    new Date(NOW.getTime() - seeded.idleMinutes * 60_000),
  );
  ctx.sessions.seed(session, seeded.userAgent);
  return session;
};

const actorOf = (ctx: Setup) => createActor(ctx.user.id, ctx.user.role);

describe('SessionService.list (plan 002 §6.3)', () => {
  const seedThree = (ctx: Setup) => ({
    older: seedSession(ctx, { userId: ctx.user.id, userAgent: CHROME_WINDOWS, idleMinutes: 90 }),
    current: seedSession(ctx, { userId: ctx.user.id, userAgent: FIREFOX_LINUX, idleMinutes: 60 }),
    newer: seedSession(ctx, { userId: ctx.user.id, userAgent: SAFARI_IPHONE, idleMinutes: 5 }),
  });

  it('CA-11: consulta las activas del actor con el corte de inactividad y el máximo de la lista', async () => {
    const ctx = setup();
    const listActive = jest.spyOn(ctx.sessions, 'listActive');

    await ctx.service.list(actorOf(ctx), UNKNOWN_SESSION_ID);

    expect(listActive).toHaveBeenCalledWith(
      ctx.user.id,
      NOW,
      new Date(NOW.getTime() - IDLE_MS),
      SESSION_LIST_MAX_ITEMS,
    );
  });

  it('CA-11: la actual primero y marcada; las demás por última actividad descendente', async () => {
    const ctx = setup();
    const { older, current, newer } = seedThree(ctx);

    const items = await ctx.service.list(actorOf(ctx), current.id);

    expect(items.map((item) => [item.id, item.current])).toEqual([
      [current.id, true],
      [newer.id, false],
      [older.id, false],
    ]);
  });

  it('CA-11: resume el agente y no expone IP, agente completo, hashes ni dispositivo', async () => {
    const ctx = setup();
    const { current, newer } = seedThree(ctx);
    seedSession(ctx, { userId: OTHER_USER_ID, userAgent: CHROME_WINDOWS, idleMinutes: 1 });

    const items = await ctx.service.list(actorOf(ctx), current.id);

    expect(items).toHaveLength(3);
    items.forEach((item) => expect(sessionSummarySchema.parse(item)).toEqual(item));
    expect(items[1]).toEqual({
      id: newer.id,
      browser: 'Safari',
      os: 'iOS',
      deviceKind: 'mobile',
      startedAt: newer.creadaEn.toISOString(),
      lastActiveAt: newer.ultimoUso.toISOString(),
      current: false,
    });
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain(newer.deviceId);
    expect(serialized).not.toContain(newer.refreshHash);
    expect(serialized).not.toContain('Mozilla');
  });
});

describe('SessionService.revoke y revokeOthers (plan 002 §6.3)', () => {
  it('CA-12: ajena, inexistente o ya revocada dan el mismo `SessionNotFoundError` y no cambian nada', async () => {
    const ctx = setup();
    const foreign = seedSession(ctx, { userId: OTHER_USER_ID, userAgent: '', idleMinutes: 1 });
    const own = seedSession(ctx, { userId: ctx.user.id, userAgent: '', idleMinutes: 1 });
    await ctx.sessions.update(own.revoke(new Date(NOW.getTime() - 60_000)));
    const before = ctx.sessions.all();

    for (const id of [foreign.id, UNKNOWN_SESSION_ID, own.id]) {
      await expect(ctx.service.revoke(actorOf(ctx), id, UNKNOWN_SESSION_ID)).rejects.toBeInstanceOf(
        SessionNotFoundError,
      );
    }

    expect(ctx.sessions.all()).toEqual(before);
    expect(ctx.logger.info).not.toHaveBeenCalled();
  });

  it('CA-12: cierra una sesión propia, avisa si era la actual y lo registra', async () => {
    const ctx = setup();
    const current = seedSession(ctx, { userId: ctx.user.id, userAgent: '', idleMinutes: 1 });
    const other = seedSession(ctx, { userId: ctx.user.id, userAgent: '', idleMinutes: 2 });

    const closedOther = await ctx.service.revoke(actorOf(ctx), other.id, current.id);
    const closedCurrent = await ctx.service.revoke(actorOf(ctx), current.id, current.id);

    expect(closedOther).toEqual({ wasCurrent: false });
    expect(closedCurrent).toEqual({ wasCurrent: true });
    expect(stored(ctx, other.id).revocadaEn).toEqual(NOW);
    expect(stored(ctx, current.id).revocadaEn).toEqual(NOW);
    expect(loggedEvents(ctx.logger)).toEqual([
      revokedBy(ctx, { sessionId: other.id, reason: 'user', count: 1 }),
      revokedBy(ctx, { sessionId: current.id, reason: 'user', count: 1 }),
    ]);
  });

  it('CA-13: `revokeOthers` cierra las demás del actor, conserva la actual y devuelve cuántas', async () => {
    const ctx = setup();
    const current = seedSession(ctx, { userId: ctx.user.id, userAgent: '', idleMinutes: 1 });
    const others = [2, 3, 4].map((idleMinutes) =>
      seedSession(ctx, { userId: ctx.user.id, userAgent: '', idleMinutes }),
    );
    const foreign = seedSession(ctx, { userId: OTHER_USER_ID, userAgent: '', idleMinutes: 1 });

    const revokedCount = await ctx.service.revokeOthers(actorOf(ctx), current.id);

    expect(revokedCount).toBe(3);
    others.forEach((session) => expect(stored(ctx, session.id).revocadaEn).toEqual(NOW));
    expect(stored(ctx, current.id).revocadaEn).toBeNull();
    expect(stored(ctx, foreign.id).revocadaEn).toBeNull();
    expect(loggedEvents(ctx.logger)).toEqual([revokedBy(ctx, { reason: 'others', count: 3 })]);
  });
});
