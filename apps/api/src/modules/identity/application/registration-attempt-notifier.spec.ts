import { MAX_AVISOS_INTENTO_24H } from '@nimbo/contracts';

import type { IRateLimiter, RateLimitDecision } from '../../../shared';
import { FixedClock } from '../../../shared/domain/fixed.clock';
import { assertIdempotencyKey } from '../../notifications';

import { RegistrationAttemptNotifier } from './registration-attempt-notifier';
import { aClientUser } from './testing/client-user.builder';

const NOW = new Date('2026-09-23T16:14:00.000Z');
const SECONDS_PER_DAY = 86_400;
const IDEMPOTENCY_PATTERN =
  /^identity\.attempt-notice\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const setup = (decision: RateLimitDecision) => {
  const consume = jest.fn<Promise<RateLimitDecision>, Parameters<IRateLimiter['consume']>>();
  consume.mockResolvedValue(decision);
  const logger = { info: jest.fn(), warn: jest.fn() };
  const notifier = new RegistrationAttemptNotifier(
    { consume },
    new FixedClock(NOW),
    { webPublicUrl: 'http://localhost' },
    logger,
  );
  return { notifier, consume, logger };
};

describe('RegistrationAttemptNotifier', () => {
  const user = aClientUser().withEmail('lucia@ejemplo.com').verified().build();

  it('CA-2: consulta el límite con la clave de la cuenta y un aviso cada 24 h', async () => {
    const { notifier, consume } = setup({ allowed: true });

    await notifier.maybeNotify(user);

    expect(consume).toHaveBeenCalledWith(`identity:attempt-notice:${user.id}`, [
      { limit: MAX_AVISOS_INTENTO_24H, windowSeconds: SECONDS_PER_DAY },
    ]);
  });

  it('CA-2: si se permite, devuelve el aviso para el dueño y registra `attempt_notice_sent`', async () => {
    const { notifier, logger } = setup({ allowed: true });

    const message = await notifier.maybeNotify(user);

    expect(message).toMatchObject({
      to: 'lucia@ejemplo.com',
      subject: 'Alguien intentó crear una cuenta con tu correo',
      tag: 'identity.attempt-notice',
      recipientId: user.id,
    });
    expect(message?.idempotencyKey).toMatch(IDEMPOTENCY_PATTERN);
    expect(() => {
      assertIdempotencyKey(message?.idempotencyKey ?? '');
    }).not.toThrow();
    expect(message?.text).toContain('El 23/09/2026 a las 10:14 (hora de Guatemala)');
    expect(message?.text).toContain('http://localhost/iniciar-sesion');
    expect(message?.text).toContain('http://localhost/recuperar-contrasena');
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.registration.attempt_notice_sent',
      userId: user.id,
    });
  });

  it('CA-2: dos avisos permitidos usan claves de idempotencia distintas', async () => {
    const { notifier } = setup({ allowed: true });

    const first = await notifier.maybeNotify(user);
    const second = await notifier.maybeNotify(user);

    expect(first?.idempotencyKey).not.toBe(second?.idempotencyKey);
  });

  it('CA-2: si el límite lo rechaza, no devuelve correo y registra `attempt_notice_suppressed`', async () => {
    const { notifier, logger } = setup({ allowed: false, retryAfterSeconds: 3600 });

    const message = await notifier.maybeNotify(user);

    expect(message).toBeNull();
    expect(logger.info).toHaveBeenCalledWith({
      event: 'identity.registration.attempt_notice_suppressed',
      userId: user.id,
    });
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'identity.registration.attempt_notice_sent' }),
    );
  });

  it('CA-18: las bitácoras no llevan el correo', async () => {
    const { notifier, logger } = setup({ allowed: true });

    await notifier.maybeNotify(user);

    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('lucia@ejemplo.com');
  });
});
