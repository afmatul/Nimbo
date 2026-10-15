import { Role } from '../../../shared/domain/role.enum';

import { AccountStatus } from './account-status.enum';
import { ClientUser, VerifiedAccountReplacementError } from './client-user.entity';
import { EmailAddress } from './email-address.vo';
import { AccountStateConflictError } from './errors';
import { LegalAcceptance } from './legal-acceptance.vo';
import { PasswordHash } from './password-hash.vo';

const acceptance = (): LegalAcceptance =>
  LegalAcceptance.of({
    termsVersion: '1.0',
    privacyVersion: '1.0',
    acceptedAt: new Date('2026-09-30T00:00:00.000Z'),
  });

const register = (): ClientUser =>
  ClientUser.register({
    id: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b',
    fullName: 'Ana López',
    email: EmailAddress.of('ana@ejemplo.com'),
    passwordHash: PasswordHash.fromPhc('$argon2id$stored'),
    acceptance: acceptance(),
  });

describe('ClientUser', () => {
  it('CA-1, CA-7: nace como cliente activo, sin el correo verificado y con la aceptación recibida', () => {
    const user = register();

    expect(user.role).toBe(Role.CLIENT);
    expect(user.emailVerified).toBe(false);
    expect(user.status).toBe(AccountStatus.ACTIVE);
    expect(user.acceptance.termsVersion).toBe('1.0');
    expect(user.acceptance.privacyVersion).toBe('1.0');
  });

  it('CA-4: reemplaza el registro pendiente en una instancia nueva y deja la original intacta', () => {
    const original = register();
    const nextHash = PasswordHash.fromPhc('$argon2id$nuevo');
    const nextAcceptance = LegalAcceptance.of({
      termsVersion: '1.1',
      privacyVersion: '1.1',
      acceptedAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    const replaced = original.replacePendingRegistration({
      fullName: 'Ana María López',
      passwordHash: nextHash,
      acceptance: nextAcceptance,
    });

    expect(replaced).not.toBe(original);
    expect(replaced.fullName).toBe('Ana María López');
    expect(replaced.passwordHash).toBe(nextHash);
    expect(replaced.acceptance).toBe(nextAcceptance);
    expect(replaced.emailVerified).toBe(false);
    expect(original.fullName).toBe('Ana López');
    expect(original.passwordHash.reveal()).toBe('$argon2id$stored');
    expect(original.acceptance.termsVersion).toBe('1.0');
  });

  it('CA-4: no reemplaza una cuenta ya verificada', () => {
    const verified = register().verifyEmail();
    expect(() =>
      verified.replacePendingRegistration({
        fullName: 'Otra',
        passwordHash: PasswordHash.fromPhc('$argon2id$otro'),
        acceptance: acceptance(),
      }),
    ).toThrow(VerifiedAccountReplacementError);
  });

  it('CA-8: verifica el correo en otra instancia', () => {
    const original = register();
    const verified = original.verifyEmail();

    expect(verified).not.toBe(original);
    expect(verified.emailVerified).toBe(true);
    expect(original.emailVerified).toBe(false);
  });

  it('011 CA-2, CA-3: se suspende y se reactiva en instancias nuevas', () => {
    const active = register();
    const suspended = active.suspend();
    const reactivated = suspended.reactivate();

    expect(suspended.status).toBe(AccountStatus.SUSPENDED);
    expect(reactivated.status).toBe(AccountStatus.ACTIVE);
    expect(active.status).toBe(AccountStatus.ACTIVE);
    expect(reactivated.acceptance).toBe(active.acceptance);
  });

  it('011 CA-2, CA-3: suspender una suspendida o reactivar una activa es un conflicto de estado', () => {
    expect(() => register().reactivate()).toThrow(AccountStateConflictError);
    expect(() => register().suspend().suspend()).toThrow(AccountStateConflictError);
  });
});
