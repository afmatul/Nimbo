import { Role } from '../../../shared/domain/role.enum';

import { AccountStatus } from './account-status.enum';
import { EmailAddress } from './email-address.vo';
import { InternalUser } from './internal-user.entity';
import { PasswordHash } from './password-hash.vo';

describe('InternalUser', () => {
  const props = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    fullName: 'Soporte Nimbo',
    email: EmailAddress.of('soporte@nimbo.me'),
    passwordHash: PasswordHash.fromPhc('$argon2id$interno'),
    status: AccountStatus.ACTIVE,
    emailVerified: true,
  };

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])('rehidrata una cuenta de solo lectura con rol %s', (role) => {
    const user = InternalUser.rehydrate({ ...props, role });

    expect(user.role).toBe(role);
    expect(user.emailVerified).toBe(true);
    expect('verifyEmail' in user).toBe(false);
    expect('replacePendingRegistration' in user).toBe(false);
  });

  it('rechaza el rol de cliente', () => {
    expect(() => InternalUser.rehydrate({ ...props, role: Role.CLIENT })).toThrow(TypeError);
  });
});
