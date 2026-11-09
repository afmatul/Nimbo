import { createHash } from 'node:crypto';

import type {
  AttemptReservation,
  FailureRecord,
  IAttemptLockout,
  IPasswordHasher,
  LockoutPolicy,
  LockState,
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
const CEILING: LockoutPolicy = { maxFailures: 100, windowSeconds: 3600, lockSeconds: 3600 };
const LOCKED_SECONDS = 600;
const NETWORK_HASH = createHash('sha256').update('2001:db8:aa:bb::/64').digest('hex');
/** Plan §5: el bloqueo es por enlace y red (RN-7), con el hash de la red, nunca la IP (S-3). */
const FAILURE_KEY = `sharing:link-fail:${LINK_ID}:${NETWORK_HASH}`;
/** 013b plan §5: el techo global es por enlace, sin red ni IP (PD-175). */
const CEILING_KEY = `sharing:link-fail-all:${LINK_ID}`;
const UNLOCKED: LockState = { locked: false };
const NOT_COUNTED: FailureRecord = { locked: false };

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

interface Scenario {
  readonly reservation?: AttemptReservation;
  /** Lo que `check` del techo responde (013b CA-12). */
  readonly ceiling?: LockState;
  /** Lo que `recordFailure` del techo responde (013b CA-14). */
  readonly ceilingFailure?: FailureRecord;
}

const setup = ({
  reservation = { allowed: true, engagedLock: false },
  ceiling = UNLOCKED,
  ceilingFailure = NOT_COUNTED,
}: Scenario = {}) => {
  const journal: string[] = [];
  const hasher: IPasswordHasher = {
    hash: jest.fn(),
    verify: jest.fn((_hash: PasswordHash, plain: string) => {
      journal.push('verify');
      return Promise.resolve(plain === PASSWORD);
    }),
  };
  const lockout = {
    check: jest.fn(() => {
      journal.push('check');
      return Promise.resolve(ceiling);
    }),
    recordFailure: jest.fn(() => {
      journal.push('recordFailure');
      return Promise.resolve(ceilingFailure);
    }),
    reserveAttempt: jest.fn(() => {
      journal.push('reserveAttempt');
      return Promise.resolve(reservation);
    }),
    clear: jest.fn(() => {
      journal.push('clear');
      return Promise.resolve();
    }),
  } satisfies IAttemptLockout;
  const config = { publicLinkLockout: LOCKOUT, publicLinkCeiling: CEILING } as SharingConfig;
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

    expect(journal).toEqual(['check', 'reserveAttempt', 'verify', 'clear']);
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
      expect(journal).toEqual(['check']);
      expect(logger.info).not.toHaveBeenCalled();
    },
  );

  it('CA-12, CA-18: con una incorrecta, el intento cuenta y `password_failed` va solo con el enlace', async () => {
    const { gate, journal, lockout, logger } = setup();

    await expect(gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual({
      passed: false,
      engagedLock: false,
    });

    expect(journal).toEqual(['check', 'reserveAttempt', 'verify', 'recordFailure']);
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
    const { gate } = setup({ reservation: { allowed: true, engagedLock: true } });

    await expect(gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual({
      passed: false,
      engagedLock: true,
    });
  });

  it('CA-13: si el intento que llena la ventana es el correcto, pasa y libera la reserva', async () => {
    const { gate, lockout } = setup({ reservation: { allowed: true, engagedLock: true } });

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
        reservation: { allowed: false, retryAfterSeconds: LOCKED_SECONDS },
      });

      const error = await gate.check(PROTECTED, { password, ip: IP }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect((error as RateLimitExceededError).retryAfterSeconds).toBe(LOCKED_SECONDS);
      expect(journal).toEqual(['check', 'reserveAttempt']);
      expect(logger.info).not.toHaveBeenCalled();
    },
  );
});

describe('PublicLinkPasswordGate.check: techo global por enlace (013b CA-12 a CA-15, PD-175)', () => {
  const CEILING_SECONDS = 3000;
  const CEILING_ACTIVE: LockState = { locked: true, retryAfterSeconds: CEILING_SECONDS };
  const CEILING_ENGAGED: FailureRecord = {
    locked: true,
    retryAfterSeconds: 3600,
    engagedLock: true,
  };
  /** Otro fallo simultáneo activó el techo un instante antes (013b CA-14). */
  const CEILING_ALREADY_ACTIVE: FailureRecord = {
    locked: true,
    retryAfterSeconds: 3600,
    engagedLock: false,
  };

  it.each([
    ['la correcta', PASSWORD],
    ['una incorrecta', WRONG_PASSWORD],
    ['ninguna', undefined],
    ['una vacía', ''],
  ])(
    'CA-12: con el techo activo, 429 con su espera aunque llegue %s, sin reservar ni verificar',
    async (_, password) => {
      const { gate, journal, lockout, logger } = setup({ ceiling: CEILING_ACTIVE });

      const error = await gate.check(PROTECTED, { password, ip: IP }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitExceededError);
      expect((error as RateLimitExceededError).retryAfterSeconds).toBe(CEILING_SECONDS);
      expect(journal).toEqual(['check']);
      expect(lockout.check).toHaveBeenCalledWith(CEILING_KEY);
      expect(logger.info).not.toHaveBeenCalled();
    },
  );

  it('CA-12: un fallo cuenta para el techo con la llave del enlace, sin la red, y su política', async () => {
    const { gate, lockout } = setup();

    await gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP });

    expect(lockout.recordFailure).toHaveBeenCalledWith(CEILING_KEY, CEILING);
    expect(CEILING_KEY).not.toContain(NETWORK_HASH);
  });

  it('CA-13, RN-3: un acierto libera solo la reserva por red; el techo no cuenta ni se reinicia', async () => {
    const { gate, lockout } = setup();

    await expect(gate.check(PROTECTED, { password: PASSWORD, ip: IP })).resolves.toEqual({
      passed: true,
    });

    expect(lockout.clear.mock.calls).toEqual([[FAILURE_KEY]]);
    expect(lockout.recordFailure).not.toHaveBeenCalled();
  });

  it.each([
    ['solo el techo', false, CEILING_ENGAGED, true],
    ['solo la red', true, NOT_COUNTED, true],
    ['los dos en el mismo intento', true, CEILING_ENGAGED, true],
    ['ninguno (el techo ya estaba activo)', false, CEILING_ALREADY_ACTIVE, false],
  ])(
    'CA-14: `engagedLock` si lo activa %s, para auditar `public_link.locked` una sola vez',
    async (_, networkEngaged, ceilingFailure, engagedLock) => {
      const { gate } = setup({
        reservation: { allowed: true, engagedLock: networkEngaged },
        ceilingFailure,
      });

      await expect(gate.check(PROTECTED, { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual({
        passed: false,
        engagedLock,
      });
    },
  );

  it('CA-15: un enlace sin contraseña no mira ni cuenta el techo', async () => {
    const { gate, lockout } = setup({ ceiling: CEILING_ACTIVE });

    await expect(gate.check(linkWith(null), { password: WRONG_PASSWORD, ip: IP })).resolves.toEqual(
      { passed: true },
    );
    expect(lockout.check).not.toHaveBeenCalled();
    expect(lockout.recordFailure).not.toHaveBeenCalled();
  });
});
