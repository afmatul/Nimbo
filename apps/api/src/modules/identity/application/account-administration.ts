import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, Role } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { AccountStatus } from '../domain/account-status.enum';
import {
  AccountNotFoundError,
  ActorNotActiveError,
  CannotChangeOwnStatusError,
  LastActiveAdminError,
} from '../domain/errors';
import type { User } from '../domain/user.entity';

import type { IdentityLogger } from './identity-logger';
import { logMassRevocation } from './mass-session-revocation';
import { I_ADMIN_ROSTER_REPOSITORY } from './ports/i-admin-roster.repository.port';
import type { IAdminRosterRepository } from './ports/i-admin-roster.repository.port';
import { I_SESSION_REPOSITORY } from './ports/i-session-repository.port';
import type { ISessionRepository } from './ports/i-session-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';

/**
 * Una suspensión hecha dentro de la transacción del llamador y su paso posterior al commit (como `Enrollment`): la
 * bitácora de las sesiones revocadas es de `identity`, pero solo es cierta si la transacción se confirma.
 */
export interface Suspension {
  /** Anota `identity.session.revoked` (`reason: account_suspended`) si revocó alguna sesión. */
  logRevokedSessions(): void;
}

/** Mínimo de Administradores activos que debe quedar tras una suspensión (011 RN-7). */
const MIN_ACTIVE_ADMINS = 1;

/**
 * Fachada de escritura de cuentas para el backoffice (011 plan §2; clase sin interfaz, Art. V.2): suspender,
 * reactivar y comprobar que el actor interno sigue activo. Corre dentro de la transacción del llamador, que exige el
 * candado y el `FOR UPDATE`; quién puede hacerlo por rol y el evento de auditoría los pone `backoffice`.
 */
@Injectable()
export class AccountAdministration {
  constructor(
    @Inject(I_ADMIN_ROSTER_REPOSITORY) private readonly users: IAdminRosterRepository,
    @Inject(I_SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: Pick<IdentityLogger, 'info'>,
  ) {}

  /** Candado del padrón de Administradores hasta el fin de la transacción; reentrante en ella (RN-7, CA-7). */
  lockAdminRoster(): Promise<void> {
    return this.users.lockAdminRoster();
  }

  /** RN-7, CA-14: el actor interno sigue `activa` en la transacción vigente, aunque su token siga valiendo. */
  async assertActorActive(actor: Actor): Promise<void> {
    if ((await this.users.statusOf(actor.id)) !== AccountStatus.ACTIVE) {
      throw new ActorNotActiveError();
    }
  }

  /**
   * CA-2, CA-4: candado → no a sí mismo → fila `FOR UPDATE` → no al último Administrador activo → `suspendida`,
   * invalida su enlace de alta vigente (CA-5: reactivar no lo revive) y revoca todas sus sesiones (002 D-10). El
   * llamador anota la revocación con `logRevokedSessions()` **después** de su commit.
   * «No a sí mismo» va antes de leer la fila (igual que en `reactivate`): solo compara ids, y así un pedido que se
   * rechazará no bloquea ninguna fila.
   */
  async suspend(actor: Actor, id: string): Promise<Suspension> {
    await this.users.lockAdminRoster();
    assertNotSelf(actor, id);
    const target = await this.lockedAccount(id);
    await this.assertNotLastActiveAdmin(target);
    await this.users.updateStatus(id, target.suspend().status);
    const now = this.clock.now();
    await this.tokens.invalidateActive(id, 'alta_interna', now);
    const count = await this.sessions.revokeAllExcept(id, null, now);
    return {
      logRevokedSessions: () =>
        logMassRevocation(this.logger, { userId: id, reason: 'account_suspended', count }),
    };
  }

  /** CA-3, CA-4: candado → no a sí mismo → `activa`. Las sesiones revocadas no vuelven. */
  async reactivate(actor: Actor, id: string): Promise<void> {
    await this.users.lockAdminRoster();
    assertNotSelf(actor, id);
    const target = await this.lockedAccount(id);
    await this.users.updateStatus(id, target.reactivate().status);
  }

  private async lockedAccount(id: string): Promise<User> {
    const account = await this.users.findByIdForUpdate(id);
    if (account === null) {
      throw new AccountNotFoundError();
    }
    return account;
  }

  private async assertNotLastActiveAdmin(target: User): Promise<void> {
    const isActiveAdmin = target.role === Role.ADMIN && target.status === AccountStatus.ACTIVE;
    if (isActiveAdmin && (await this.users.countActiveAdmins()) <= MIN_ACTIVE_ADMINS) {
      throw new LastActiveAdminError();
    }
  }
}

const assertNotSelf = (actor: Actor, id: string): void => {
  if (actor.id === id) {
    throw new CannotChangeOwnStatusError();
  }
};
