import { ACCESS_TOKEN_TTL_SECONDS, SESSION_IDLE_TIMEOUT_DAYS } from '@nimbo/contracts';

import { FixedClock } from '../../../shared/domain/fixed.clock';
import { Role } from '../../../shared/domain/role.enum';
import type { MailMessage } from '../../notifications';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { RefreshToken } from '../domain/refresh-token.vo';

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
    { webPublicUrl: 'http://localhost/' },
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
