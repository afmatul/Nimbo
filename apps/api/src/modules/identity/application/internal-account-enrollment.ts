import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { IDENTITY_FIELD_MESSAGES } from '@nimbo/contracts';
import type { FieldIssueReason } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { Role } from '../../../shared';
import type { Actor, FieldIssue } from '../../../shared';
import { I_MAILER } from '../../notifications';
import type { IMailer, MailMessage } from '../../notifications';
import { EmailAddress } from '../domain/email-address.vo';
import { EmployeeCode } from '../domain/employee-code.vo';
import {
  AdminAlreadyExistsError,
  EnrollmentConflictError,
  IdentityInvalidInputError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import { OpaqueToken } from '../domain/opaque-token.vo';
import type { PasswordHash } from '../domain/password-hash.vo';

import { AccountSetupLinkIssuer } from './account-setup-link-issuer';
import type { IdentityLogger } from './identity-logger';
import { I_ADMIN_ROSTER_REPOSITORY } from './ports/i-admin-roster.repository.port';
import type { IAdminRosterRepository } from './ports/i-admin-roster.repository.port';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';

/** Alta interna ya validada por `enrollInternalAccountRequestSchema`; correo y código aún sin normalizar. */
export interface EnrollInternalCommand {
  readonly fullName: string;
  readonly email: string;
  readonly employeeCode: string;
  readonly role: Role;
}

/** Alta del primer Administrador (CA-7): el rol lo fija el comando. */
export type InitialAdminCommand = Omit<EnrollInternalCommand, 'role'>;

/** Lo que el llamador necesita para auditar el alta: el id y el rol, sin datos personales. */
export interface EnrolledAccount {
  readonly id: string;
  readonly role: Role;
}

/** La cuenta creada y el envío del correo, que el llamador hace **después** del commit (plan R-4). */
export interface Enrollment {
  readonly account: EnrolledAccount;
  deliverInvitation(): Promise<void>;
}

/**
 * Fachada de altas internas (011 plan §2; clase sin interfaz, Art. V.2). Corre dentro de la transacción del llamador:
 * inserta la cuenta con el hash de un secreto aleatorio que nadie conoce y emite el enlace `alta_interna` de un solo
 * uso. Si el correo falla, la cuenta queda creada y la persona usa «¿Olvidaste tu contraseña?» (Q-3).
 */
@Injectable()
export class InternalAccountEnrollment {
  constructor(
    @Inject(I_ADMIN_ROSTER_REPOSITORY) private readonly users: IAdminRosterRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(AccountSetupLinkIssuer) private readonly setupLinks: AccountSetupLinkIssuer,
    @Inject(I_MAILER) private readonly mailer: IMailer,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /**
   * CA-5, CA-6: Administrador, Soporte u Operador; nunca `CLIENT` (RN-5). El hash (Argon2) se calcula dentro de la
   * transacción del llamador: las altas son raras y tardan décimas de segundo, y sacarlo agrandaría la API (YAGNI).
   * `_actor` no se usa aquí: lo exige la regla «todo servicio que toca datos de un usuario recibe `actor`»;
   * autoriza `backoffice`.
   */
  async enroll(_actor: Actor, command: EnrollInternalCommand): Promise<Enrollment> {
    if (command.role === Role.CLIENT) {
      throw new IdentityInvalidInputError([issue('role', 'INVALID_ROLE')]);
    }
    return this.enrollAccount(command, await this.discardedSecretHash());
  }

  /**
   * CA-7: con el candado del padrón; si ya hay un Administrador activo, `AdminAlreadyExistsError`. El hash (Argon2,
   * lento) se calcula antes del candado para no retenerlo, como `AccountSetupService` lo hace fuera de la transacción.
   */
  async enrollInitialAdmin(command: InitialAdminCommand): Promise<Enrollment> {
    const passwordHash = await this.discardedSecretHash();
    await this.users.lockAdminRoster();
    if ((await this.users.countActiveAdmins()) > 0) {
      throw new AdminAlreadyExistsError();
    }
    return this.enrollAccount({ ...command, role: Role.ADMIN }, passwordHash);
  }

  /** Hash de un secreto aleatorio que nadie conoce: la persona crea su contraseña con el enlace. */
  private discardedSecretHash(): Promise<PasswordHash> {
    return this.hasher.hash(OpaqueToken.generate().toString());
  }

  private async enrollAccount(
    command: EnrollInternalCommand,
    passwordHash: PasswordHash,
  ): Promise<Enrollment> {
    const user = InternalUser.enroll({
      id: randomUUID(),
      fullName: command.fullName.trim(),
      email: EmailAddress.of(command.email),
      employeeCode: EmployeeCode.of(command.employeeCode),
      role: command.role,
      passwordHash,
    });
    if (!(await this.users.insertInternalIfAbsent(user))) {
      throw await this.conflictOf(user);
    }
    const invitation = await this.setupLinks.issue(user);
    return {
      account: { id: user.id, role: user.role },
      deliverInvitation: () => this.deliver(invitation),
    };
  }

  /**
   * CA-6: marca el correo, el código o ambos; el `ON CONFLICT` no dice cuál chocó. Si ninguno se encuentra (la cuenta
   * que chocó se borró entre el `INSERT` y la lectura), no hay campo que marcar: es un fallo inesperado, no un 409.
   */
  private async conflictOf(user: InternalUser): Promise<Error> {
    const fields: FieldIssue[] = [];
    if ((await this.users.findByEmail(user.email)) !== null) {
      fields.push(issue('email', 'EMAIL_IN_USE'));
    }
    if ((await this.users.findByEmployeeCode(user.employeeCode)) !== null) {
      fields.push(issue('employeeCode', 'EMPLOYEE_CODE_IN_USE'));
    }
    if (fields.length === 0) {
      return new Error(
        'El alta interna chocó con una cuenta que ya no existe; vuelve a intentarlo.',
      );
    }
    return new EnrollmentConflictError(fields);
  }

  /** Plan R-4: un fallo al encolar no deshace el alta; queda en la bitácora sin correo ni enlace. */
  private async deliver(invitation: MailMessage): Promise<void> {
    try {
      await this.mailer.send(invitation);
    } catch (error: unknown) {
      this.logger.warn({
        event: 'identity.invitation.mail_failed',
        userId: invitation.recipientId,
        reason: errorNameOf(error),
      });
    }
  }
}

/** Solo el nombre de la clase del error: su mensaje podría traer el correo del destinatario. */
const errorNameOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

const issue = (field: string, reason: FieldIssueReason): FieldIssue => ({
  field,
  reason,
  message: IDENTITY_FIELD_MESSAGES[reason],
});
