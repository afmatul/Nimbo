import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK } from '../../../shared';
import type { Actor, IClock } from '../../../shared';
import { I_AGENT_QUOTA } from '../../billing';
import type {
  AgentQuotaReservation,
  AgentQuotaReserveResult,
  AgentQuotaStatus,
  IAgentQuota,
} from '../../billing';
import type { AgentQuestion } from '../domain/agent-question';
import { AgentQuotaExceededError } from '../domain/errors';

import { AgentAdmission } from './agent-admission';
import type { AdmissionRequest } from './agent-admission';
import { AGENT_CONFIG } from './agent-config';
import type { AgentConfig } from './agent-config';
import { AgentAskTrace, outcomeOfError } from './agent-logger';
import { AnswerComposer } from './answer-composer';
import type { AgentAnswerEvent, AnswerUsage } from './answer-composer';
import { HybridRetriever } from './hybrid-retriever';
import type { IntelligenceLogger } from './intelligence-logger';

/** Pregunta del cliente con su ámbito (RN-9) y la señal que se aborta si cierra la petición (P-9). */
export interface AskRequest extends AdmissionRequest {
  readonly signal: AbortSignal;
}

/** `GET /agent/status` (CA-7, CA-10, S-3). */
export interface AgentStatus extends AgentQuotaStatus {
  readonly hasIndexedFiles: boolean;
  readonly maxQuestionChars: number;
}

/** Lo que el servicio usa del recuperador (para el doble de las pruebas). */
export type AgentRetriever = Pick<HybridRetriever, 'retrieve'>;

type GrantedQuota = Extract<AgentQuotaReserveResult, { outcome: 'granted' }>;

/** Pregunta admitida y con consulta reservada, lista para recuperar y componer. */
interface ReservedAsk {
  readonly question: AgentQuestion;
  readonly request: AskRequest;
  readonly usage: AnswerUsage;
}

/** La consulta reservada y lo necesario para decidir si se devuelve (P-9). */
interface HeldReservation {
  readonly actor: Actor;
  readonly reservation: AgentQuotaReservation;
  readonly signal: AbortSignal;
}

/**
 * Orquesta una pregunta al agente (plan 020 §2, fila 3; D-9): admisión → `reserve` → recuperación → composición. Sin
 * archivos indexados responde la frase fija sin `reserve` ni modelo (CA-7). Devuelve la consulta (`release`) si algo
 * falla antes de terminar (CA-15) o si se cancela antes del primer evento; cancelar después cuenta (P-9). Cada pregunta
 * deja una línea `agent.asked` (CA-18). No guarda pregunta ni respuesta (RN-10).
 */
@Injectable()
export class AgentService {
  constructor(
    @Inject(AgentAdmission) private readonly admission: AgentAdmission,
    @Inject(I_AGENT_QUOTA) private readonly quota: IAgentQuota,
    @Inject(HybridRetriever) private readonly retriever: AgentRetriever,
    @Inject(AnswerComposer) private readonly composer: AnswerComposer,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: IntelligenceLogger,
    @Inject(AGENT_CONFIG) private readonly config: AgentConfig,
  ) {}

  /** Los errores previos al primer evento (422, 404, 429, 503) salen en el primer `next()`, antes de abrir el flujo. */
  async *ask(actor: Actor, request: AskRequest): AsyncGenerator<AgentAnswerEvent> {
    const trace = new AgentAskTrace(this.logger, this.clock);
    try {
      yield* this.answer(actor, request, trace);
    } catch (error) {
      trace.settle(outcomeOfError(error, request.signal));
      throw error;
    } finally {
      trace.log();
    }
  }

  async status(actor: Actor): Promise<AgentStatus> {
    const usage = await this.quota.status(actor);
    const hasIndexedFiles = await this.admission.hasIndexed(actor);
    return { ...usage, hasIndexedFiles, maxQuestionChars: this.config.maxQuestionChars };
  }

  private async *answer(
    actor: Actor,
    request: AskRequest,
    trace: AgentAskTrace,
  ): AsyncGenerator<AgentAnswerEvent> {
    const { question, hasIndexed } = await this.admission.admit(actor, request);
    if (!hasIndexed) {
      const { used, limit } = await this.quota.status(actor);
      const unindexed = { question, fragments: [], usage: { used, limit } };
      yield* this.composer.compose(unindexed, request.signal);
      trace.settle('no_indexed');
      return;
    }
    const granted = await this.reserve(actor);
    const usage = { used: granted.used, limit: granted.limit };
    const hold = { actor, reservation: granted.reservation, signal: request.signal };
    yield* this.releasingOnFailure(hold, this.respond(actor, { question, request, usage }, trace));
  }

  private async reserve(actor: Actor): Promise<GrantedQuota> {
    const result = await this.quota.reserve(actor);
    if (result.outcome === 'exhausted') {
      throw new AgentQuotaExceededError(result.limit, result.resetsAt);
    }
    return result;
  }

  private async *respond(
    actor: Actor,
    ask: ReservedAsk,
    trace: AgentAskTrace,
  ): AsyncGenerator<AgentAnswerEvent> {
    const { question, request, usage } = ask;
    const retrieval = await this.retriever.retrieve(actor, { question, scope: request.scope });
    trace.retrieved(retrieval);
    const composition = { question, fragments: retrieval.fragments, usage };
    for await (const event of this.composer.compose(composition, request.signal)) {
      if (event.type === 'done') trace.settle(event.outcome);
      yield event;
    }
  }

  /**
   * Devuelve la consulta si el flujo no termina y además falló (no por cancelar) o no llegó a entregar ningún evento
   * (P-9, CA-15). Cancelar o dejar de leer después del primer evento cuenta como respondida.
   */
  private async *releasingOnFailure(
    hold: HeldReservation,
    events: AsyncGenerator<AgentAnswerEvent>,
  ): AsyncGenerator<AgentAnswerEvent> {
    let delivered = false;
    let completed = false;
    let failed = false;
    try {
      for await (const event of events) {
        delivered = true;
        yield event;
      }
      completed = true;
    } catch (error) {
      failed = !hold.signal.aborted;
      throw error;
    } finally {
      if (!completed && (failed || !delivered)) await this.release(hold);
    }
  }

  /** Un fallo al devolver la consulta no tapa el error original (se prefiere sobrecobrar una, plan §7 riesgo 5). */
  private async release(hold: HeldReservation): Promise<void> {
    try {
      await this.quota.release(hold.actor, hold.reservation);
    } catch {
      this.logger.warn({ event: 'agent.release_failed' });
    }
  }
}
