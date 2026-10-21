import { Role } from '../../../shared/domain/role.enum';

import { AccountStatus } from './account-status.enum';
import { EmailAddress } from './email-address.vo';
import { EmployeeCode } from './employee-code.vo';
import { AccountStateConflictError } from './errors';
import { InternalUser } from './internal-user.entity';
import { PasswordHash } from './password-hash.vo';

const enrollInput = (role: Role = Role.SUPPORT) => ({
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  fullName: 'Soporte Nimbo',
  email: EmailAddress.of('soporte@nimbo.me'),
  employeeCode: EmployeeCode.of('SOP-014'),
  role,
  passwordHash: PasswordHash.fromPhc('$argon2id$secreto-descartado'),
});

describe('InternalUser', () => {
  const props = {
    ...enrollInput(),
    status: AccountStatus.ACTIVE,
    emailVerified: true,
  };

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'rehidrata una cuenta con rol %s y su código de empleado',
    (role) => {
      const user = InternalUser.rehydrate({ ...props, role });

      expect(user.role).toBe(role);
      expect(user.emailVerified).toBe(true);
      expect(user.employeeCode.value).toBe('SOP-014');
      expect('verifyEmail' in user).toBe(false);
      expect('replacePendingRegistration' in user).toBe(false);
    },
  );

  it('rechaza el rol de cliente', () => {
    expect(() => InternalUser.rehydrate({ ...props, role: Role.CLIENT })).toThrow(TypeError);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    '011 CA-5: el alta con rol %s nace activa, verificada y con su código',
    (role) => {
      const user = InternalUser.enroll(enrollInput(role));

      expect(user).toMatchObject({ role, status: AccountStatus.ACTIVE, emailVerified: true });
      expect(user.employeeCode.value).toBe('SOP-014');
    },
  );

  it('011 CA-6, RN-5: el alta rechaza el rol de cliente', () => {
    expect(() => InternalUser.enroll(enrollInput(Role.CLIENT))).toThrow(TypeError);
  });

  it('011 CA-2, CA-3: se suspende y se reactiva en instancias nuevas, sin perder su código', () => {
    const active = InternalUser.enroll(enrollInput());
    const suspended = active.suspend();
    const reactivated = suspended.reactivate();

    expect(suspended.status).toBe(AccountStatus.SUSPENDED);
    expect(reactivated.status).toBe(AccountStatus.ACTIVE);
    expect(active.status).toBe(AccountStatus.ACTIVE);
    expect(reactivated.employeeCode).toBe(active.employeeCode);
  });

  it('011 CA-2, CA-3: suspender una suspendida o reactivar una activa es un conflicto de estado', () => {
    const active = InternalUser.enroll(enrollInput());

    expect(() => active.reactivate()).toThrow(AccountStateConflictError);
    expect(() => active.suspend().suspend()).toThrow(AccountStateConflictError);
  });

  it('011 CA-5: fija la primera contraseña en otra instancia', () => {
    const enrolled = InternalUser.enroll(enrollInput());
    const chosen = PasswordHash.fromPhc('$argon2id$elegida');

    const withPassword = enrolled.setFirstPassword(chosen);

    expect(withPassword.passwordHash).toBe(chosen);
    expect(enrolled.passwordHash).not.toBe(chosen);
    expect(withPassword).toMatchObject({ role: Role.SUPPORT, status: AccountStatus.ACTIVE });
  });
});
