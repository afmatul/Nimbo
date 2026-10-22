import { Inject, Injectable } from '@nestjs/common';
import { EDITING_EVENTS } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { I_REALTIME_PUBLISHER } from '../../realtime';
import type { IRealtimePublisher } from '../../realtime';
import { EditableFileGateway } from '../../storage';
import type { EditedVersionOutcome } from '../../storage';
import type { EditSession, EditSessionFailure } from '../domain/edit-session';
import { editedVersionIdOf } from '../domain/edited-version-id';

import { EDITING_CONFIG } from './editing-config';
import type { EditingConfig } from './editing-config';
import type { EditingLogger } from './editing-logger';
import { EditorDownloadRejectedError, I_DOCUMENT_EDITOR } from './ports/i-document-editor.port';
import type { DownloadRejection, IDocumentEditor } from './ports/i-document-editor.port';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';
import type { SaveVersionJob } from './ports/i-save-version-queue.port';
import { SaveFailedNotifier } from './save-failed-notifier';

/** Lo entregado puede pesar hasta el doble del tope editable (plan §4): un `.docx` editado crece. */
const DOWNLOAD_SIZE_FACTOR = 2n;

/** Lo que deja el registro, más la descarga rechazada (origen, redirección o tamaño, CA-19). */
type SaveOutcome = EditedVersionOutcome | { readonly status: DownloadRejection };
type Registered = Extract<EditedVersionOutcome, { status: 'registered' }>;
type Saved = Extract<EditedVersionOutcome, { status: 'registered' | 'duplicate' }>;
type Unsaved = Exclude<SaveOutcome, Saved>;

/** Un archivo purgado en plena sesión falla como tal; lo demás que no se registra es una entrega no íntegra (CA-14). */
const failureOf = ({ status }: Unsaved): EditSessionFailure =>
  status === 'file_missing' ? 'archivo_purgado' : 'integridad';

/**
 * El trabajo `editing-save` (plan 016 §2 y §4; corre en el `api`, ADR-0029). Relee la sesión con la cuenta propietaria
 * firmada (`withActor`, no confía en el trabajo) y solo sigue si está `guardando`; descarga lo entregado y pide a
 * `storage` la versión `origen='edicion'` con un id determinista (uuid v5 de la sesión): un reintento da `duplicate`,
 * que cuenta como éxito (CA-10). Después cierra la sesión, avisa a la sala y audita; la reindexación la dispara `storage`
 * al registrar la versión (`storage.file-version-created`, 019 RN-11), no este servicio (CA-12).
 * Una descarga rechazada o un documento que `storage` no registra no se reintenta: la sesión queda `fallida` con su
 * motivo (CA-14). Un error transitorio se propaga para que la cola reintente; al agotar los intentos, `giveUp`.
 */
@Injectable()
export class SaveVersionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(EditableFileGateway) private readonly files: EditableFileGateway,
    @Inject(I_DOCUMENT_EDITOR) private readonly editor: IDocumentEditor,
    @Inject(EDITING_CONFIG) private readonly config: EditingConfig,
    @Inject(I_REALTIME_PUBLISHER) private readonly publisher: IRealtimePublisher,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: EditingLogger,
    @Inject(SaveFailedNotifier) private readonly failures: SaveFailedNotifier,
  ) {}

  async save(job: SaveVersionJob): Promise<void> {
    const owner = createActor(job.ownerId, Role.CLIENT);
    const session = await this.savingSession(owner, job.sessionId);
    if (session === null) {
      this.logger.info({ event: 'editing.save_skipped', sessionId: job.sessionId });
      return;
    }
    const outcome = await this.register(owner, session, job.url);
    if (outcome.status === 'registered' || outcome.status === 'duplicate') {
      await this.finish(owner, session, outcome);
      return;
    }
    await this.failures.fail(owner, session, failureOf(outcome));
  }

  /** Se agotaron los intentos del trabajo (plan §4): si la sesión sigue `guardando`, falla por almacenamiento. */
  async giveUp(job: SaveVersionJob): Promise<void> {
    const owner = createActor(job.ownerId, Role.CLIENT);
    const session = await this.savingSession(owner, job.sessionId);
    if (session !== null) await this.failures.fail(owner, session, 'almacenamiento');
  }

  /** La sesión del trabajo si sigue `guardando` y es de la cuenta firmada; si no, otro intento ya la terminó. */
  private async savingSession(owner: Actor, sessionId: string): Promise<EditSession | null> {
    const session = await this.transactions.withActor(owner, () =>
      this.sessions.findOpen(owner, sessionId),
    );
    return session?.state === 'guardando' && session.ownerId === owner.id ? session : null;
  }

  /** Una descarga rechazada no baja nada ni toca `storage`: se informa con su motivo. */
  private async register(owner: Actor, session: EditSession, url: string): Promise<SaveOutcome> {
    try {
      const document = await this.editor.download(
        url,
        this.config.maxDocBytes * DOWNLOAD_SIZE_FACTOR,
      );
      return await this.files.registerEditedVersion(owner, {
        fileId: session.fileId,
        versionId: editedVersionIdOf(session.id),
        editSessionId: session.id,
        createdBy: session.openedBy,
        content: document.content,
        sizeBytes: document.sizeBytes,
      });
    } catch (error) {
      if (!(error instanceof EditorDownloadRejectedError)) throw error;
      return { status: error.reason };
    }
  }

  private async finish(owner: Actor, session: EditSession, saved: Saved): Promise<void> {
    await this.transactions.withActor(owner, () =>
      this.sessions.compareAndSet(owner, session.close(this.clock.now()), 'guardando'),
    );
    this.publisher.toDocument(session.fileId, {
      event: EDITING_EVENTS.VERSION_SAVED,
      payload: { sessionId: session.id },
    });
    if (saved.status === 'registered') await this.recordCreated(owner, session, saved);
    const ids = { sessionId: session.id, fileId: session.fileId, versionId: saved.versionId };
    this.logger.info({ event: 'editing.saved', ...ids });
  }

  private recordCreated(owner: Actor, session: EditSession, version: Registered): Promise<void> {
    return this.audit.record({
      action: AuditAction.FILE_VERSION_CREATED,
      actor: owner,
      targetUserId: owner.id,
      resourceId: session.fileId,
      attributes: {
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        sizeBytes: Number(version.sizeBytes),
        sessionId: session.id,
      },
    });
  }
}
