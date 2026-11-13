import { PasswordHash } from '../../../../shared';
import { AccountStatus } from '../../domain/account-status.enum';
import { ClientUser } from '../../domain/client-user.entity';
import { EmailAddress } from '../../domain/email-address.vo';
import { LegalAcceptance } from '../../domain/legal-acceptance.vo';

/** Builder de cuentas de cliente para pruebas de aplicación (conventions §Pruebas). */
export class ClientUserBuilder {
  private id = '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b';
  private email = 'ana@ejemplo.com';
  private isVerified = false;
  private isSuspended = false;
  private passwordHashPhc = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
  private pendingPlanSlug: string | null = null;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  withPasswordHash(phc: string): this {
    this.passwordHashPhc = phc;
    return this;
  }

  withPendingPlan(slug: string): this {
    this.pendingPlanSlug = slug;
    return this;
  }

  verified(): this {
    this.isVerified = true;
    return this;
  }

  suspended(): this {
    this.isSuspended = true;
    return this;
  }

  build(): ClientUser {
    const user = this.registered();
    const verified = this.isVerified ? user.verifyEmail() : user;
    return this.isSuspended
      ? ClientUser.rehydrate({
          id: verified.id,
          fullName: verified.fullName,
          email: verified.email,
          passwordHash: verified.passwordHash,
          acceptance: verified.acceptance,
          pendingPlanSlug: verified.pendingPlanSlug,
          emailVerified: verified.emailVerified,
          status: AccountStatus.SUSPENDED,
        })
      : verified;
  }

  private registered(): ClientUser {
    return ClientUser.register({
      id: this.id,
      fullName: 'Ana López',
      email: EmailAddress.of(this.email),
      passwordHash: PasswordHash.fromPhc(this.passwordHashPhc),
      acceptance: LegalAcceptance.of({
        termsVersion: '1.0',
        privacyVersion: '1.0',
        acceptedAt: new Date('2026-09-30T12:00:00.000Z'),
      }),
      pendingPlanSlug: this.pendingPlanSlug,
    });
  }
}

export const aClientUser = (): ClientUserBuilder => new ClientUserBuilder();
