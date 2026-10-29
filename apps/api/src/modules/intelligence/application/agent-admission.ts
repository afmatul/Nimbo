import { Inject, Injectable } from '@nestjs/common';

import { I_RATE_LIMITER, I_TRANSACTION_RUNNER, RateLimitExceededError } from '../../../shared';
import type { Actor, IRateLimiter, ITransactionRunner, RateLimitRule } from '../../../shared';
import { AgentQuestion } from '../domain/agent-question';
import type { AgentScope } from '../domain/agent-scope';
import { AgentScopeNotFoundError } from '../domain/errors';

import { AGENT_CONFIG } from './agent-config';
import type { AgentConfig } from './agent-config';
import { I_CHUNK_SEARCH } from './ports/i-chunk-search.port';
import type { IChunkSearch } from './ports/i-chunk-search.port';

/** Preguntas por cuenta y minuto antes de reservar (plan 020 §5): frena ráfagas sin gastar consultas del plan. */
export const AGENT_ASK_RATE_RULE: RateLimitRule = { limit: 10, windowSeconds: 60 };

export const AGENT_RATE_KEY_PREFIX = 'intelligence:agent:';

/** Lo que la admisión lee de los fragmentos: solo si el ámbito existe y si hay algo indexado (CA-7, CA-17). */
export type AdmissionChunkSearch = Pick<IChunkSearch, 'hasIndexed' | 'scopeExists'>;

/** Pregunta recibida, antes de validar. */
export interface AdmissionRequest {
  readonly question: string;
  readonly scope: AgentScope;
}

/** Pregunta admitida: el texto validado y si el actor tiene alguna versión vigente indexada (CA-7). */
export interface Admission {
  readonly question: AgentQuestion;
  readonly hasIndexed: boolean;
}

/**
 * Admisión de una pregunta al agente (plan 020 §2, fila 3), en este orden y sin tocar el contador: límite de tasa por
 * cuenta (429 `SHARED_TOO_MANY_REQUESTS`), pregunta válida (422, CA-6), ámbito accesible (404 idéntico para ajeno o
 * inexistente, CA-17) y si hay archivos indexados (CA-7). El ámbito y los indexados se leen en un `withActor`.
 */
@Injectable()
export class AgentAdmission {
  constructor(
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_CHUNK_SEARCH) private readonly search: AdmissionChunkSearch,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(AGENT_CONFIG) private readonly config: AgentConfig,
  ) {}

  async admit(actor: Actor, request: AdmissionRequest): Promise<Admission> {
    await this.assertWithinRate(actor);
    const question = AgentQuestion.parse(request.question, this.config.maxQuestionChars);
    const hasIndexed = await this.transactions.withActor(actor, async () => {
      if (!(await this.search.scopeExists(actor, request.scope)))
        throw new AgentScopeNotFoundError();
      return this.search.hasIndexed(actor);
    });
    return { question, hasIndexed };
  }

  /** Para `GET /agent/status` (CA-7). */
  hasIndexed(actor: Actor): Promise<boolean> {
    return this.transactions.withActor(actor, () => this.search.hasIndexed(actor));
  }

  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(AGENT_RATE_KEY_PREFIX + actor.id, [
      AGENT_ASK_RATE_RULE,
    ]);
    if (!decision.allowed) throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}
