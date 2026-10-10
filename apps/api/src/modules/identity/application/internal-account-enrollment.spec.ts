import { randomUUID } from 'node:crypto';

import { ACCOUNT_SETUP_LINK_TTL_HOURS } from '@nimbo/contracts';

import { createActor, FixedClock, Role } from '../../../shared';
import type { MailMessage } from '../../notifications';
import { AccountStatus } from '../domain/account-status.enum';
import {
  AdminAlreadyExistsError,
  EnrollmentConflictError,
  IdentityInvalidInputError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import { OpaqueToken } from '../domain/opaque-token.vo';
import { PasswordHash } from '../domain/password-hash.vo';

import type { EnrollInternalCommand } from './internal-account-enrollment';
import { InternalAccountEnrollment } from './internal-account-enrollment';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { aClientUser } from './testing/client-user.builder';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';
import { InMemoryVerificationTokenRepository } from './testing/in-memory-verification-token.repository';
import { anInternalUser } from './testing/internal-user.builder';

const NOW = new Date('2026-10-09T15:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const SETUP_LINK = /^http:\/\/localhost\/crear-contrasena#token=([A-Za-z0-9_-]{43})$/;
const ADMIN = createActor(randomUUID(), Role.ADMIN);

const aCommand = (patch: Partial<EnrollInternalCommand> = {}): EnrollInternalCommand => ({
  fullName: '  Sofía Ramírez ',
  email: ' Sofia.Ramirez@Nimbo.me ',
  employeeCode: ' sop-014 ',
  role: Role.SUPPORT,
  ...patch,
});

const setup = () => {
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const hashed: string[] = [];
  const hasher: IPasswordHasher = {
    hash: jest.fn((plain: string) => {
      hashed.push(plain);
      return Promise.resolve(PasswordHash.fromPhc(`fake$${plain}`));
    }),
    verify: jest.fn(() => Promise.resolve(false)),
  };
  const sent: MailMessage[] = [];
  const mailer = {
    send: jest.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const enrollment = new InternalAccountEnrollment(
    users,
    tokens,
    hasher,
    mailer,
    new FixedClock(NOW),
    { webPublicUrl: 'http://localhost/', cookieSecure: false },
    logger,
  );
  return { users, tokens, hashed, mailer, sent, logger, enrollment };
};

const tokenOf = (mail: MailMessage | undefined): string => {
  const token = SETUP_LINK.exec(mail?.text.split('\n')[2] ?? '')?.[1];
  if (token === undefined) throw new Error('El correo no trae el enlace de alta.');
  return token;
};

describe('InternalAccountEnrollment (011 CA-5 a CA-7)', () => {
  describe('enroll', () => {
    it('CA-5: crea la cuenta activa, verificada, con datos normalizados y el hash de un secreto aleatorio', async () => {
      const { enrollment, users, hashed } = setup();

      const { account } = await enrollment.enroll(ADMIN, aCommand());

      const [created] = users.all();
      expect(created).toBeInstanceOf(InternalUser);
      expect(account).toEqual({ id: created?.id, role: Role.SUPPORT });
      expect(created).toMatchObject({
        fullName: 'Sofía Ramírez',
        status: AccountStatus.ACTIVE,
        emailVerified: true,
      });
      expect(created?.email.value).toBe('sofia.ramirez@nimbo.me');
      expect((created as InternalUser).employeeCode.value).toBe('SOP-014');
      expect(hashed).toHaveLength(1);
      expect(OpaqueToken.isWellFormed(hashed[0] ?? '')).toBe(true);
    });

    it('CA-5: emite un enlace `alta_interna` de 24 h guardado solo como hash', async () => {
      const { enrollment, tokens, sent } = setup();

      const { deliverInvitation } = await enrollment.enroll(ADMIN, aCommand());
      await deliverInvitation();

      const [token] = tokens.all();
      const value = tokenOf(sent[0]);
      expect(token).toMatchObject({ type: 'alta_interna', tokenHash: OpaqueToken.hashOf(value) });
      expect(token?.expiresAt.getTime()).toBe(
        NOW.getTime() + ACCOUNT_SETUP_LINK_TTL_HOURS * MS_PER_HOUR,
      );
    });

    it('CA-5: el correo sale solo cuando el llamador lo pide (después del commit)', async () => {
      const { enrollment, mailer, sent, users } = setup();

      const { deliverInvitation } = await enrollment.enroll(ADMIN, aCommand());
      expect(mailer.send).not.toHaveBeenCalled();
      await deliverInvitation();

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: 'sofia.ramirez@nimbo.me',
        subject: 'Crea tu contraseña de Nimbo',
        tag: 'identity.internal-invitation',
        recipientId: users.all()[0]?.id,
      });
    });

    it('plan R-4: si el correo falla, la cuenta queda y la bitácora lo anota sin datos personales', async () => {
      const { enrollment, mailer, logger, users } = setup();
      mailer.send.mockRejectedValueOnce(new Error('Redis caído'));

      const { deliverInvitation } = await enrollment.enroll(ADMIN, aCommand());
      await expect(deliverInvitation()).resolves.toBeUndefined();

      expect(users.all()).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith({
        event: 'identity.invitation.mail_failed',
        userId: users.all()[0]?.id,
      });
    });

    it('CA-6: el rol Cliente → `IDENTITY_INVALID_INPUT` en `role` y no crea nada', async () => {
      const { enrollment, users, tokens } = setup();

      const error = await enrollment.enroll(ADMIN, aCommand({ role: Role.CLIENT })).catch((e) => e);

      expect(error).toBeInstanceOf(IdentityInvalidInputError);
      expect((error as IdentityInvalidInputError).fields).toEqual([
        expect.objectContaining({ field: 'role', reason: 'INVALID_ROLE' }),
      ]);
      expect(users.all()).toEqual([]);
      expect(tokens.all()).toEqual([]);
    });

    it.each<[string, { email?: string; employeeCode?: string }, string[]]>([
      ['el correo', { email: 'sofia.ramirez@nimbo.me' }, ['email']],
      ['el código', { employeeCode: 'SOP-014' }, ['employeeCode']],
      [
        'ambos',
        { email: 'sofia.ramirez@nimbo.me', employeeCode: 'SOP-014' },
        ['email', 'employeeCode'],
      ],
    ])(
      'CA-6: %s repetido → `IDENTITY_ENROLLMENT_CONFLICT` con esos `fields`',
      async (_, taken, fields) => {
        const { enrollment, users, tokens } = setup();
        users.seed(
          anInternalUser()
            .withEmail(taken.email ?? 'otra@nimbo.me')
            .withEmployeeCode(taken.employeeCode ?? 'OTRO-1')
            .build(),
        );

        const error = await enrollment.enroll(ADMIN, aCommand()).catch((e) => e);

        expect(error).toBeInstanceOf(EnrollmentConflictError);
        expect((error as EnrollmentConflictError).fields?.map((issue) => issue.field)).toEqual(
          fields,
        );
        expect(users.all()).toHaveLength(1);
        expect(tokens.all()).toEqual([]);
      },
    );

    it('CA-6: el correo de un cliente también choca', async () => {
      const { enrollment, users } = setup();
      users.seed(aClientUser().withId(randomUUID()).withEmail('sofia.ramirez@nimbo.me').build());

      await expect(enrollment.enroll(ADMIN, aCommand())).rejects.toBeInstanceOf(
        EnrollmentConflictError,
      );
    });
  });

  describe('enrollInitialAdmin', () => {
    const initial = { fullName: 'Primera Admin', email: 'admin@nimbo.me', employeeCode: 'ADM-001' };

    it('CA-7: sin Administrador activo, toma el candado y crea el primero con su enlace', async () => {
      const { enrollment, users } = setup();
      const lock = jest.spyOn(users, 'lockAdminRoster');
      users.seed(anInternalUser().suspended().build());

      const { account } = await enrollment.enrollInitialAdmin(initial);

      expect(lock).toHaveBeenCalledTimes(1);
      expect(account.role).toBe(Role.ADMIN);
      expect(await users.countActiveAdmins()).toBe(1);
    });

    it('CA-7: con un Administrador activo → `AdminAlreadyExistsError` y no crea nada', async () => {
      const { enrollment, users, tokens } = setup();
      users.seed(anInternalUser().build());

      await expect(enrollment.enrollInitialAdmin(initial)).rejects.toBeInstanceOf(
        AdminAlreadyExistsError,
      );
      expect(users.all()).toHaveLength(1);
      expect(tokens.all()).toEqual([]);
    });
  });
});
