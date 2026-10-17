import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { Action, PermissionResolver } from '../../access';
import type { EditSession } from '../domain/edit-session';

import { CONTENT_LINK_SIGNER } from './content-link.signer';
import type { ContentLinkSigner } from './content-link.signer';
import { EditSessionService } from './edit-session.service';
import type { EditingLogger } from './editing-logger';
import { I_DOCUMENT_EDITOR } from './ports/i-document-editor.port';
import type { EditorSignal, IDocumentEditor } from './ports/i-document-editor.port';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';
import { I_SAVE_VERSION_QUEUE } from './ports/i-save-version-queue.port';
import type { ISaveVersionQueue } from './ports/i-save-version-queue.port';
import { PresenceService } from './presence.service';
import { SaveFailedNotifier } from './save-failed-notifier';

/** Lo que llega al `callbackUrl`: el enlace firmado por Nimbo (`link`) y el token firmado por el editor. */
export interface CallbackInput {
  readonly link: string;
  readonly token: string;
}

/** Respuesta que espera ONLYOFFICE: `0` acusa recibo; `1` solo si la firma no vale (plan §4, CA-19). */
export interface CallbackAck {
  readonly error: 0 | 1;
}

const ACK: CallbackAck = { error: 0 };
const REJECTED: CallbackAck = { error: 1 };

/** Un aviso con las dos firmas válidas y de la misma sesión: actúa con la cuenta propietaria del enlace. */
interface VerifiedCallback {
  readonly owner: Actor;
  readonly sessionId: string;
  readonly signal: EditorSignal;
}

/**
 * Aviso del servidor de documentos (plan 016 §4). Exige el enlace de `callbackUrl` (sesión y propietaria firmadas por
 * Nimbo) y el JWT del editor con la misma clave de documento; si no, `{"error":1}` sin tocar nada (CA-19). Con la
 * propietaria como actor relee la sesión y enruta: `editing` revalida el acceso y reconcilia la presencia (CA-16,
 * PD-101); `ready` pasa la sesión a `guardando` y encola `editing-save` sin procesar en la petición (RN-7, DF-20);
 * `closed` la termina sin versión (CA-11); `failed` (estado 3) la deja `fallida/editor` y avisa (CA-14); el resto se
 * ignora (RN-4). Una sesión desconocida o cerrada se acusa y se anota, sin tormenta de reintentos.
 */
@Injectable()
export class SaveCallbackHandler {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(CONTENT_LINK_SIGNER) private readonly links: ContentLinkSigner | null,
    @Inject(I_DOCUMENT_EDITOR) private readonly editor: IDocumentEditor,
    @Inject(PermissionResolver) private readonly permissions: PermissionResolver,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(EditSessionService) private readonly editSessions: EditSessionService,
    @Inject(I_SAVE_VERSION_QUEUE) private readonly saveQueue: ISaveVersionQueue,
    @Inject(PinoLogger) private readonly logger: EditingLogger,
    @Inject(SaveFailedNotifier) private readonly failures: SaveFailedNotifier,
  ) {}

  async handle(input: CallbackInput): Promise<CallbackAck> {
    const callback = this.verify(input);
    if (callback === null) {
      this.logger.warn({ event: 'editing.callback_rejected' });
      return REJECTED;
    }
    const { owner, sessionId } = callback;
    const session = await this.transactions.withActor(owner, () =>
      this.sessions.findOpen(owner, sessionId),
    );
    if (session === null) {
      this.logger.info({
        event: 'editing.callback_ignored',
        sessionId,
        kind: callback.signal.kind,
      });
      return ACK;
    }
    await this.route(callback, session);
    return ACK;
  }

  private verify({ link, token }: CallbackInput): VerifiedCallback | null {
    const target = this.links?.verifyCallback(link) ?? null;
    const signal = this.editor.verifyCallback(token);
    if (target === null || signal?.documentKey !== target.sessionId) return null;
    return { owner: createActor(target.ownerId, Role.CLIENT), sessionId: target.sessionId, signal };
  }

  private route({ owner, signal }: VerifiedCallback, session: EditSession): Promise<void> {
    if (signal.kind === 'editing') return this.reconcile(owner, session, signal.users);
    if (signal.kind === 'ready') return this.startSaving(owner, session, signal.downloadUrl);
    if (signal.kind === 'closed') return this.editSessions.closeWithoutChanges(owner, session);
    if (signal.kind === 'failed') return this.failures.fail(owner, session, 'editor');
    this.logger.info({
      event: 'editing.callback_ignored',
      sessionId: session.id,
      kind: signal.kind,
    });
    return Promise.resolve();
  }

  /** Estado 1: quien perdió el permiso sale de la sala y del editor (CA-16); el resto cuenta como conectado. */
  private async reconcile(
    owner: Actor,
    session: EditSession,
    users: readonly string[],
  ): Promise<void> {
    const connected: string[] = [];
    for (const userId of users) {
      if (await this.canStillEdit(session, userId)) connected.push(userId);
      else await this.editSessions.revokeAccess(owner, { fileId: session.fileId, userId });
    }
    await this.presence.reconcile(owner, { session, connected });
  }

  /** La propietaria conserva lo suyo aunque esté en la papelera (RN-11); los demás, con `PermissionResolver`. */
  private canStillEdit(session: EditSession, userId: string): Promise<boolean> {
    if (userId === session.ownerId) return Promise.resolve(true);
    const actor = createActor(userId, Role.CLIENT);
    return this.transactions.withActor(actor, () =>
      this.permissions.can(actor, session.fileId, Action.EDIT),
    );
  }

  /**
   * Estado 2: `activa → guardando` (comparar y asignar) y un trabajo por sesión. Si ya estaba `guardando` (un aviso
   * repetido) se vuelve a encolar con el mismo `jobId`: la cola no lo duplica (CA-10).
   */
  private async startSaving(owner: Actor, session: EditSession, url: string | null): Promise<void> {
    if (url === null) {
      this.logger.warn({ event: 'editing.callback_ignored', sessionId: session.id, kind: 'ready' });
      return;
    }
    if (session.state === 'activa') {
      await this.transactions.withActor(owner, () =>
        this.sessions.compareAndSet(owner, session.startSaving(), 'activa'),
      );
    }
    await this.saveQueue.enqueue({ sessionId: session.id, ownerId: owner.id, url });
    this.logger.info({ event: 'editing.save_enqueued', sessionId: session.id });
  }
}
