import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { Action, PermissionResolver } from '../../access';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { EditableFileGateway, I_PLAN_LIMITS_PROVIDER, NodeNotFoundError } from '../../storage';
import type { EditableFile, IPlanLimitsProvider } from '../../storage';
import { EditModePolicy } from '../domain/edit-mode-policy';
import type { EditModeDecision, ReadOnlyReason } from '../domain/edit-mode-policy';
import { EditSession } from '../domain/edit-session';
import { EditingSaveInProgressError } from '../domain/errors';

import { EDITING_CONFIG } from './editing-config';
import type { EditingConfig } from './editing-config';
import { EditorAvailability } from './editor-availability';
import type { EditorLaunch } from './editor-config.factory';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';
import { I_USER_DIRECTORY } from './ports/i-user-directory.port';
import type { IUserDirectory } from './ports/i-user-directory.port';

/** Bitácora técnica de `editing`: solo identificadores, nunca nombres de archivo, tokens ni URLs (RNF-17). */
export type EditingLogger = Pick<PinoLogger, 'info' | 'warn' | 'error'>;

/** Si una cuenta ya no tiene nombre (borrada a mitad de sesión), se muestra igual sin inventar uno ajeno (RN-12). */
const UNNAMED_PARTICIPANT = 'Persona sin nombre';

const nameOf = (names: ReadonlyMap<string, string>, userId: string): string =>
  names.get(userId) ?? UNNAMED_PARTICIPANT;

/** Lo que decide la apertura: el archivo, si quien abre puede editar y el máximo de editores de la propietaria. */
interface OpenContext {
  readonly actor: Actor;
  readonly file: EditableFile;
  readonly canEdit: boolean;
  readonly ownerMaxEditors: number;
}

/** El modo decidido dentro de la transacción y la sesión (en edición) con sus participantes conectados. */
interface Admission {
  readonly decision: EditModeDecision;
  readonly session: EditSession | null;
  readonly participants: readonly string[];
}

/** El modo con su sesión: en edición siempre hay sesión; en solo lectura, motivo y ninguna sesión (plan §4). */
export type OpenedMode =
  | { readonly mode: 'edit'; readonly readOnlyReason: null; readonly sessionId: string }
  | { readonly mode: 'view'; readonly readOnlyReason: ReadOnlyReason; readonly sessionId: null };

/** Respuesta de `POST /files/:fileId/edit-session` (contrato `OpenEditSessionResponse`). */
export type OpenedEditor = EditorLaunch &
  OpenedMode & {
    readonly participants: readonly { readonly userId: string; readonly displayName: string }[];
    readonly editors: number;
    readonly maxEditors: number;
    readonly lastSaveFailed: boolean;
  };

const modeOf = ({ decision, session }: Admission): OpenedMode => {
  if (decision.mode === 'view') return { ...decision, sessionId: null };
  if (session === null) throw new Error('Una apertura en edición siempre tiene sesión.');
  return { ...decision, sessionId: session.id };
};

/**
 * Abrir un `.docx` en el editor (plan 016 §1, CA-1 a CA-7, CA-15, CA-17, CA-21, CA-22). Responde siempre con un modo:
 * resuelve el archivo con `accessibleNodes(actor)` (ajeno, en la papelera o inexistente = 404, CA-2), exige `.docx`
 * (CA-4) y el servicio disponible (CA-15), y decide con el nivel del actor y el plan de la **cuenta propietaria**
 * (RN-3). En edición reutiliza la sesión abierta o la crea (`uq_sesion_edicion_abierta` resuelve la carrera) y da de
 * alta la participación bajo `FOR UPDATE` de la sesión, para que dos aperturas no pasen el límite (CA-7).
 */
@Injectable()
export class EditSessionService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(EditableFileGateway) private readonly files: EditableFileGateway,
    @Inject(PermissionResolver) private readonly permissions: PermissionResolver,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(I_USER_DIRECTORY) private readonly users: IUserDirectory,
    @Inject(EditorAvailability) private readonly availability: EditorAvailability,
    @Inject(EDITING_CONFIG) private readonly config: EditingConfig,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: EditingLogger,
  ) {}

  async open(actor: Actor, fileId: string): Promise<OpenedEditor> {
    const context = await this.contextFor(actor, fileId);
    const factory = await this.availability.factory();
    const admission = await this.admit(context);
    const names = await this.users.displayNames([actor.id, ...admission.participants]);
    const launch = factory.build({
      file: context.file,
      decision: admission.decision,
      sessionId: admission.session?.id ?? null,
      user: { id: actor.id, name: nameOf(names, actor.id) },
    });
    if (admission.session !== null) await this.recordOpened(actor, admission.session);
    return this.toOpened(context, admission, { launch, names });
  }

  private async contextFor(actor: Actor, fileId: string): Promise<OpenContext> {
    const file = await this.files.find(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    EditModePolicy.assertEditable(file.kind);
    const canEdit = await this.transactions.withActor(actor, () =>
      this.permissions.can(actor, file.id, Action.EDIT),
    );
    const owner = createActor(file.ownerId, Role.CLIENT);
    const { maxEditors } = await this.planLimits.limitsFor(owner);
    return { actor, file, canEdit, ownerMaxEditors: maxEditors };
  }

  /** Un solo reintento: si otra apertura creó la sesión a la vez, se decide de nuevo sobre la suya. */
  private async admit(context: OpenContext): Promise<Admission> {
    const first = await this.transactions.withActor(context.actor, () => this.tryAdmit(context));
    if (first !== null) return first;
    const second = await this.transactions.withActor(context.actor, () => this.tryAdmit(context));
    if (second === null)
      throw new Error('La sesión de edición cambió dos veces durante la apertura.');
    return second;
  }

  /** `null` si perdió la carrera por crear la sesión del archivo. */
  private async tryAdmit(context: OpenContext): Promise<Admission | null> {
    const { actor, file } = context;
    const open = await this.sessions.findOpenForUpdate(actor, file.id);
    if (open?.state === 'guardando') throw new EditingSaveInProgressError();
    const connected = open === null ? [] : await this.sessions.activeParticipants(actor, open.id);
    const decision = this.decide(context, connected);
    if (decision.mode === 'view') return { decision, session: null, participants: connected };
    const session = open ?? (await this.createSession(context));
    if (session === null) return null;
    await this.sessions.join(actor, {
      sessionId: session.id,
      userId: actor.id,
      now: this.clock.now(),
    });
    const participants = connected.includes(actor.id) ? connected : [...connected, actor.id];
    return { decision, session, participants };
  }

  private decide(context: OpenContext, connected: readonly string[]): EditModeDecision {
    return EditModePolicy.decide({
      kind: context.file.kind,
      canEdit: context.canEdit,
      openedByOwner: context.actor.id === context.file.ownerId,
      ownerMaxEditors: context.ownerMaxEditors,
      activeEditors: connected.filter((userId) => userId !== context.actor.id).length,
      sizeBytes: context.file.sizeBytes,
      maxDocBytes: this.config.maxDocBytes,
    });
  }

  private async createSession({ actor, file }: OpenContext): Promise<EditSession | null> {
    const session = EditSession.open({
      id: randomUUID(),
      fileId: file.id,
      ownerId: file.ownerId,
      openedBy: actor.id,
      baseVersionId: file.currentVersionId,
      now: this.clock.now(),
    });
    return (await this.sessions.insertIfNoneOpen(actor, session)) ? session : null;
  }

  private async recordOpened(actor: Actor, session: EditSession): Promise<void> {
    const ids = { sessionId: session.id, fileId: session.fileId, userId: actor.id };
    this.logger.info({ event: 'editing.session_opened', ...ids });
    await this.audit.record({
      action: AuditAction.EDIT_SESSION_OPENED,
      actor,
      targetUserId: session.ownerId,
      resourceId: session.fileId,
      attributes: { sessionId: session.id },
    });
  }

  private toOpened(
    context: OpenContext,
    admission: Admission,
    shown: { launch: EditorLaunch; names: ReadonlyMap<string, string> },
  ): OpenedEditor {
    const participants = admission.participants.map((userId) => ({
      userId,
      displayName: nameOf(shown.names, userId),
    }));
    return {
      ...shown.launch,
      ...modeOf(admission),
      participants,
      editors: participants.length,
      maxEditors: context.ownerMaxEditors,
      lastSaveFailed: false,
    };
  }
}
