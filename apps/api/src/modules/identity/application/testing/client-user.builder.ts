import { ClientUser } from '../../domain/client-user.entity';
import { EmailAddress } from '../../domain/email-address.vo';
import { LegalAcceptance } from '../../domain/legal-acceptance.vo';
import { PasswordHash } from '../../domain/password-hash.vo';

/** Builder de cuentas de cliente para pruebas de aplicación (conventions §Pruebas). */
export class ClientUserBuilder {
  private id = '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b';
  private email = 'ana@ejemplo.com';
  private isVerified = false;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  verified(): this {
    this.isVerified = true;
    return this;
  }

  build(): ClientUser {
    const user = ClientUser.register({
      id: this.id,
      fullName: 'Ana López',
      email: EmailAddress.of(this.email),
      passwordHash: PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'),
      acceptance: LegalAcceptance.of({
        termsVersion: '1.0',
        privacyVersion: '1.0',
        acceptedAt: new Date('2026-09-30T12:00:00.000Z'),
      }),
    });
    return this.isVerified ? user.verifyEmail() : user;
  }
}

export const aClientUser = (): ClientUserBuilder => new ClientUserBuilder();
