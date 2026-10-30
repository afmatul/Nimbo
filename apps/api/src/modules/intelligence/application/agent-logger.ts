import { RateLimitExceededError } from '../../../shared';
import type { IClock } from '../../../shared';
import {
  AgentInvalidQuestionError,
  AgentQuotaExceededError,
  AgentScopeNotFoundError,
  AgentUnavailableError,
} from '../domain/errors';

import type { AnswerOutcome } from './answer-composer';
import type { Retrieval } from './hybrid-retriever';
import type { IntelligenceLogger } from './intelligence-logger';

/**
 * Resultado de una pregunta en la bitácora (plan 020 §5). Además de los del plan: `rate_limited` (límite de tasa),
 * `cancelled` (quien pregunta cerró la petición o dejó de leer) y `failed` (error no previsto).
 */
export type AgentAskOutcome =
  | AnswerOutcome
  | 'no_indexed'
  | 'quota'
  | 'unavailable'
  | 'invalid'
  | 'rate_limited'
  | 'cancelled'
  | 'failed';

/** Resultado de una pregunta que terminó en error; con la petición cancelada, `cancelled` sin importar el error. */
export function outcomeOfError(error: unknown, signal: AbortSignal): AgentAskOutcome {
  if (signal.aborted) return 'cancelled';
  if (error instanceof AgentQuotaExceededError) return 'quota';
  if (error instanceof AgentUnavailableError) return 'unavailable';
  if (error instanceof RateLimitExceededError) return 'rate_limited';
  const invalid =
    error instanceof AgentInvalidQuestionError || error instanceof AgentScopeNotFoundError;
  return invalid ? 'invalid' : 'failed';
}

/**
 * Traza de una pregunta que termina en **una** línea `agent.asked` (CA-18): duración, fragmentos recuperados,
 * descartados por procedencia inválida y resultado. El `correlationId` lo estampa el `mixin` del logger. Nunca la
 * pregunta, la respuesta, fragmentos, nombres de archivo ni la clave. Sin `done` ni error, quien consume dejó de leer:
 * `cancelled`.
 */
export class AgentAskTrace {
  private readonly startedAt: number;
  private outcome: AgentAskOutcome = 'cancelled';
  private fragmentCount = 0;
  private discarded = 0;

  constructor(
    private readonly logger: IntelligenceLogger,
    private readonly clock: IClock,
  ) {
    this.startedAt = clock.now().getTime();
  }

  retrieved(retrieval: Retrieval): void {
    this.fragmentCount = retrieval.fragments.length;
    this.discarded = retrieval.discarded;
  }

  settle(outcome: AgentAskOutcome): void {
    this.outcome = outcome;
  }

  log(): void {
    this.logger.info({
      event: 'agent.asked',
      durationMs: this.clock.now().getTime() - this.startedAt,
      fragmentCount: this.fragmentCount,
      discarded: this.discarded,
      outcome: this.outcome,
    });
  }
}
