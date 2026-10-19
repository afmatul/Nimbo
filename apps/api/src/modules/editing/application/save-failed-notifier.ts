import { Inject, Injectable } from '@nestjs/common';
import { EDITING_EVENTS } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { I_REALTIME_PUBLISHER } from '../../realtime';
import type { IRealtimePublisher } from '../../realtime';
import type { EditSession, EditSessionFailure } from '../domain/edit-session';

import type { EditingLogger } from './editing-logger';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';

/**
 * Guardado fallido de una sesión (plan 016 §2, CA-14). La pasa a `fallida` con su motivo solo si sigue en el estado en
 * que se leyó (comparar y asignar: dos fallos simultáneos avisan una vez) y, ya confirmada, avisa
 * `editing.save-failed` por `toUser` a cada participante y a la propietaria (en cualquier pantalla), audita
 * `edit.save_failed` y lo anota. La versión vigente no se toca. La usan el estado 3 del editor, el documento que no se
 * registra y el agotamiento de los intentos de `editing-save`.
 */
@Injectable()
export class SaveFailedNotifier {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(I_REALTIME_PUBLISHER) private readonly publisher: IRealtimePublisher,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: EditingLogger,
  ) {}

  /** `owner` es la cuenta propietaria de la sesión (la firmada en el enlace o el trabajo). */
  async fail(owner: Actor, session: EditSession, reason: EditSessionFailure): Promise<void> {
    const failed = session.fail(reason, this.clock.now());
    const participants = await this.transactions.withActor(owner, () =>
      this.markFailed(owner, failed, session),
    );
    if (participants === null) return;
    this.notify(failed, participants);
    await this.record(owner, failed, reason);
  }

  /** Los que participaron, si la transición se hizo; `null` si otro aviso o intento la terminó antes. */
  private async markFailed(
    owner: Actor,
    failed: EditSession,
    read: EditSession,
  ): Promise<readonly string[] | null> {
    if (!(await this.sessions.compareAndSet(owner, failed, read.state))) return null;
    return this.sessions.allParticipants(owner, failed.id);
  }

  private notify(session: EditSession, participants: readonly string[]): void {
    const notice = {
      event: EDITING_EVENTS.SAVE_FAILED,
      payload: { sessionId: session.id, fileId: session.fileId },
    };
    for (const userId of new Set([session.ownerId, ...participants]))
      this.publisher.toUser(userId, notice);
  }

  private async record(
    owner: Actor,
    session: EditSession,
    reason: EditSessionFailure,
  ): Promise<void> {
    await this.audit.record({
      action: AuditAction.EDIT_SAVE_FAILED,
      actor: owner,
      targetUserId: owner.id,
      resourceId: session.fileId,
      attributes: { sessionId: session.id, reason },
    });
    const ids = { sessionId: session.id, fileId: session.fileId, userId: owner.id };
    this.logger.warn({ event: 'editing.save_failed', ...ids, reason });
  }
}
