import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EDITING_EVENTS } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { createActor, I_CLOCK, I_TRANSACTION_RUNNER, Role } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { I_DOCUMENT_ROOMS, I_REALTIME_PUBLISHER, REALTIME_DOCUMENT_LEFT } from '../../realtime';
import type { DocumentLeftEvent, IDocumentRooms, IRealtimePublisher } from '../../realtime';
import { I_PLAN_LIMITS_PROVIDER } from '../../storage';
import type { IPlanLimitsProvider } from '../../storage';
import type { EditSession } from '../domain/edit-session';

import type { EditingLogger } from './editing-logger';
import { toParticipants } from './participants';
import type { Participant } from './participants';
import { I_EDIT_SESSION_REPOSITORY } from './ports/i-edit-session.repository.port';
import type { IEditSessionRepository } from './ports/i-edit-session.repository.port';
import { I_USER_DIRECTORY } from './ports/i-user-directory.port';
import type { IUserDirectory } from './ports/i-user-directory.port';

/** Lista de `editing.presence` de un documento: quiénes editan y el máximo del plan de la propietaria (CA-6, CA-7). */
export interface Presence {
  readonly fileId: string;
  readonly participants: readonly Participant[];
  readonly maxEditors: number;
}

/** Salida de `userId` de la sesión abierta del archivo `fileId`. */
export interface Departure {
  readonly fileId: string;
  readonly userId: string;
}

/** Lo que dejó la salida: la sesión abierta (si había) y la lista nueva (si la salida cambió algo). */
interface DepartureOutcome {
  readonly session: EditSession;
  readonly presence: Presence | null;
}

/** Clase de un error inesperado para la bitácora: nunca su mensaje, que puede traer datos (RNF-17). */
const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/**
 * Presencia de Nimbo sobre el canal de 015 (plan 016 §1, RN-9): admite la conexión en la sala del documento (la sala
 * es el id del archivo), publica la lista `editing.presence` y cierra la participación de quien sale. El acceso lo
 * verificó quien llama (`accessibleNodes(actor)`, RN-2); el canal no decide accesos (015 RN-2).
 */
@Injectable()
export class PresenceService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_EDIT_SESSION_REPOSITORY) private readonly sessions: IEditSessionRepository,
    @Inject(I_USER_DIRECTORY) private readonly users: IUserDirectory,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
    @Inject(I_DOCUMENT_ROOMS) private readonly rooms: IDocumentRooms,
    @Inject(I_REALTIME_PUBLISHER) private readonly publisher: IRealtimePublisher,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: EditingLogger,
  ) {}

  /** Une la conexión del actor a la sala del documento; `SHARED_FORBIDDEN` si no es suya (015 CA-6). */
  admit(actor: Actor, connectionId: string, fileId: string): Promise<void> {
    return this.rooms.admit(actor, connectionId, fileId);
  }

  /** Avisa la lista a todas las conexiones de la sala, sin contenido ni nombre de archivo (RN-9). */
  announce(presence: Presence): void {
    const { fileId, participants, maxEditors } = presence;
    this.publisher.toDocument(fileId, {
      event: EDITING_EVENTS.PRESENCE,
      payload: { participants, editors: participants.length, maxEditors },
    });
  }

  /** Saca de la sala del documento todas las conexiones de la cuenta; dejan de recibir sus avisos (CA-16). */
  retire({ fileId, userId }: Departure): Promise<void> {
    return this.rooms.retire(userId, fileId);
  }

  /**
   * Cierra la participación de la cuenta en la sesión abierta y, si cambió algo, avisa la lista nueva (CA-8). Devuelve
   * la sesión abierta del archivo o `null` si no hay ninguna visible para el actor.
   */
  async leave(actor: Actor, departure: Departure): Promise<EditSession | null> {
    const outcome = await this.transactions.withActor(actor, () =>
      this.closeParticipation(actor, departure),
    );
    if (outcome?.presence) this.announce(outcome.presence);
    return outcome?.session ?? null;
  }

  /** Una conexión salió de la sala (pestaña cerrada, red cortada, token vencido; 015 CA-9): libera su plaza. */
  @OnEvent(REALTIME_DOCUMENT_LEFT)
  async onDocumentLeft(event: DocumentLeftEvent): Promise<void> {
    const departure = { fileId: event.documentId, userId: event.userId };
    try {
      await this.leave(createActor(event.userId, Role.CLIENT), departure);
    } catch (error) {
      this.logger.warn({ event: 'editing.presence_leave_failed', errorClass: errorClassOf(error) });
    }
  }

  private async closeParticipation(
    actor: Actor,
    { fileId, userId }: Departure,
  ): Promise<DepartureOutcome | null> {
    const session = await this.sessions.findOpenForUpdate(actor, fileId);
    if (session === null) return null;
    const change = { sessionId: session.id, userId, now: this.clock.now() };
    if (!(await this.sessions.leave(actor, change))) return { session, presence: null };
    this.logger.info({ event: 'editing.participant_left', sessionId: session.id, fileId, userId });
    return { session, presence: await this.presenceOf(actor, session) };
  }

  private async presenceOf(actor: Actor, session: EditSession): Promise<Presence> {
    const connected = await this.sessions.activeParticipants(actor, session.id);
    const names = await this.users.displayNames(connected);
    const owner = createActor(session.ownerId, Role.CLIENT);
    const { maxEditors } = await this.planLimits.limitsFor(owner);
    return { fileId: session.fileId, participants: toParticipants(connected, names), maxEditors };
  }
}
