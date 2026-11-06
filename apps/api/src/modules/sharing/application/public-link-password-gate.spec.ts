import { createHash } from 'node:crypto';

import type {
  AttemptReservation,
  IAttemptLockout,
  IPasswordHasher,
  LockoutPolicy,
} from '../../../shared';
import { PasswordHash, RateLimitExceededError } from '../../../shared';
import { LinkToken } from '../domain/link-token';
import { PublicLink } from '../domain/public-link';

import { PublicLinkPasswordGate } from './public-link-password-gate';
import type { SharingConfig } from './sharing-config';

const LINK_ID = '44444444-4444-4444-8444-444444444444';
const IP = '2001:db8:aa:bb:1:2:3:4';
const PASSWORD_HASH = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
const PASSWORD = 'clave-del-enlace-9c2e';
const WRONG_PASSWORD = 'otra-clave-1234';
const LOCKOUT: LockoutPolicy = { maxFailures: 5, windowSeconds: 900, lockSeconds: 900 };
const LOCKED_SECONDS = 600;
/** Plan §5: el bloqueo es por enlace y red (RN-7), con el hash de la red, nunca la IP (S-3). */
const FAILURE_KEY = `sharing:link-fail:${LINK_ID}:${createHash('sha256').update('2001:db8:aa:bb::/64').digest('hex')}`;

const linkWith = (passwordHash: PasswordHash | null): PublicLink =>
  PublicLink.rehydrate({
    id: LINK_ID,
    fileId: '33333333-3333-4333-8333-333333333333',
    ownerId: '11111111-1111-4111-8111-111111111111',
    tokenHash: LinkToken.hashOf(LinkToken.generate().toString()),
    passwordHash,
    expiresAt: new Date('2026-11-09T10:00:00.000Z'),
    createdAt: new Date('2026-11-02T10:00:00.000Z'),
  });

const PROTECTED = linkWith(PASSWORD_HASH);

const setup = (reservation: AttemptReservation = { allowed: true, engagedLock: false }) => {
  const journal: string[] = [];
  const hasher: IPasswordHasher = {
    hash: jest.fn(),
    verify: jest.fn((_hash: PasswordHash, plain: string) => {
      journal.push('verify');
      return Promise.resolve(plain === PASSWORD);
    }),
  };
  const lockout: IAttemptLockout = {
    reserveAttempt: jest.fn(() => {
      journal.push('reserveAttempt');
      return Promise.resolve(reservation);
    }),
    clear: jest.fn(() => {
      journal.push('clear');
      return Promise.resolve();
    }),
  } as unknown as IAttemptLockout;
  const config = { publicLinkLockout: LOCKOUT } as SharingConfig;
  const logger = { info: jest.fn(), warn: jest.fn() };
  const gate = new PublicLinkPasswordGate(hasher, lockout, config, logger);
  return { gate, journal, hasher, lockout, logger };
};

describe('PublicLinkPasswordGate.check (013 CA-10, CA-12, CA-13, CA-18; PD-177)', () => {
  it.each([
    ['sin contraseña enviada', undefined],
    ['aunque llegue una', PASSWORD],
  ])('CA-10: un enlace sin contraseña pasa sin reservar ni verificar (%s)', async (_, password) => {
    const { gate, journal } = setup();

    await expect(gate.check(linkWith(null), { password, ip: IP })).resolves.toEqual({
      passed: true,
    });
    expect(journal).toEqual([]);
  });

  it('CA-10, CA-13: con la correcta, reserva el intento por enlace + red, verifica y lo libera', async () => {
    const { gate, journal, hasher, lockout, logger } = setup();

    await expect(gate.check(PROTECTED, { password: PASSWORD, ip: IP })).resolves.toEqual({
      passed: true,
    });

    expect(journal).toEqual(['reserveAttempt', 'verify', 'clear']);
    expect(lockout.reserveAttempt).toHaveBeenCalledWith(FAILURE_KEY, LOCKOUT);
    expect(hasher.verify).toHaveBeenCalledWith(PASSWORD_HASH, PASSWORD);
    expect(lockout.clear).toHaveBeenCalledWith(FAILURE_KEY);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each([
    ['ausente', undefined],
    ['vacía', ''],
  ])(
    'CA-12: con contraseña %s, no pasa; no cuenta para el bloqueo ni se registra',
    async (_, password) => {
      const { gate, journal, logger } = setup();

      await expect(gate.check(PROTECTED, { password, ip: IP })).resolves.toEqual({
        passed: false,
        engagedLock: false,
      });
      expect(journal).toEqual([]);
      expect(logger.info).not.toHaveBeenCalled();
    },
  );

  it('CA-12, CA-18: con una incorrecta, el intento cuenta y `password_failed` va solo con el enlace', async () => {
    const { gate, journal, lockout, logger } = setup();

    await expect(gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual({
      passed: false,
      engagedLock: false,
    });

    expect(journal).toEqual(['reserveAttempt', 'verify']);
    expect(lockout.reserveAttempt).toHaveBeenCalledWith(FAILURE_KEY, LOCKOUT);
    expect(lockout.clear).not.toHaveBeenCalled();
    expect(logger.info.mock.calls).toEqual([
      [{ event: 'public_link.password_failed', linkId: LINK_ID }],
    ]);
    const logged = JSON.stringify(logger.info.mock.calls);
    for (const secret of ['2001:db8', WRONG_PASSWORD, PASSWORD]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('CA-13: el fallo que llena la ventana avisa que activó el bloqueo', async () => {
    const { gate } = setup({ allowed: true, engagedLock: true });

    await expect(gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual({
      passed: false,
      engagedLock: true,
    });
  });

  it('CA-13: si el intento que llena la ventana es el correcto, pasa y libera la reserva', async () => {
    const { gate, lockout } = setup({ allowed: true, engagedLock: true });

    await expect(gate.check(PROTECTED, { password: PASSWORD, ip: IP })).resolves.toEqual({
      passed: true,
    });
    expect(lockout.clear).toHaveBeenCalledWith(FAILURE_KEY);
  });

  it.each([
    ['correcta', PASSWORD],
    ['incorrecta', WRONG_PASSWORD],
  ])(
    'CA-13: con el bloqueo vigente, 429 con la espera aunque sea %s, sin verificar',
    async (_, password) => {
      const { gate, journal, logger } = setup({
        allowed: false,
        retryAfterSeconds: LOCKED_SECONDS,
      });

      const error = await gate.check(PROTECTED, { password, ip: IP }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect((error as RateLimitExceededError).retryAfterSeconds).toBe(LOCKED_SECONDS);
      expect(journal).toEqual(['reserveAttempt']);
      expect(logger.info).not.toHaveBeenCalled();
    },
  );
});
