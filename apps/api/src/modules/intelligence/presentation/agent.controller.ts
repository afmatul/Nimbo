import { Body, Controller, Get, Inject, Injectable, Post, Res } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { agentAskRequestSchema } from '@nimbo/contracts';
import type { AgentAskRequest, AgentStatusResponse } from '@nimbo/contracts';
import type { Response } from 'express';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor, DomainError, FieldIssue } from '../../../shared';
import type { AdmissionRequest } from '../application/agent-admission';
import { AGENT_CONFIG } from '../application/agent-config';
import type { AgentConfig } from '../application/agent-config';
import { AgentService } from '../application/agent.service';
import type { AgentAnswerEvent } from '../application/answer-composer';
import type { AgentScope } from '../domain/agent-scope';
import { AgentInvalidQuestionError, AgentScopeNotFoundError } from '../domain/errors';

import { abortOnClose, writeEventStream } from './sse-writer';

const ALL_FILES: AgentScope = { type: 'all' };

const isScopeIssue = ({ field }: FieldIssue): boolean =>
  field === 'scope' || field.startsWith('scope.');

/**
 * Cuerpo de `POST /agent/ask` (plan 020 §4). Mal formado: un ámbito que no valida responde como uno inexistente
 * (`404 AGENT_SCOPE_NOT_FOUND`, sin oráculo, CA-17); lo demás, como pregunta vacía (`422`, CA-6). Sin `scope`, todos
 * los archivos accesibles (RN-9).
 */
@Injectable()
export class AgentAskBodyPipe implements PipeTransform<unknown, AdmissionRequest> {
  private readonly schema: ZodValidationPipe<AgentAskRequest>;

  constructor(@Inject(AGENT_CONFIG) config: AgentConfig) {
    const toError = (issues: readonly FieldIssue[]): DomainError =>
      issues.some(isScopeIssue)
        ? new AgentScopeNotFoundError()
        : new AgentInvalidQuestionError('empty', config.maxQuestionChars);
    this.schema = new ZodValidationPipe(agentAskRequestSchema, toError);
  }

  transform(value: unknown, metadata: ArgumentMetadata): AdmissionRequest {
    const { question, scope } = this.schema.transform(value, metadata);
    return { question, scope: scope ?? ALL_FILES };
  }
}

/** Primer evento de la respuesta; si quien pregunta canceló antes, nada que escribir (la consulta ya se devolvió). */
async function firstEvent(
  events: AsyncGenerator<AgentAnswerEvent>,
  signal: AbortSignal,
): Promise<AgentAnswerEvent | undefined> {
  try {
    const first = await events.next();
    return first.done === true ? undefined : first.value;
  } catch (error) {
    if (signal.aborted) return undefined;
    throw error;
  }
}

/**
 * Agente con citas (plan 020 §4, D-6). Solo `CLIENT`: un rol interno recibe `SHARED_FORBIDDEN` antes de que se procese
 * nada (CA-16). `POST /agent/ask` espera el primer evento antes de escribir cabeceras, así 422, 404, 429 y 503 salen
 * por `DomainExceptionFilter` como JSON; después, `text/event-stream`. Cancelar es cerrar la petición.
 */
@Roles(Role.CLIENT)
@Controller('agent')
export class AgentController {
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  /** CA-7, CA-10, S-3. */
  @Get('status')
  async status(@CurrentActor() actor: Actor): Promise<AgentStatusResponse> {
    const { resetsAt, ...status } = await this.agent.status(actor);
    return { ...status, resetsAt: resetsAt?.toISOString() ?? null };
  }

  @Post('ask')
  async ask(
    @CurrentActor() actor: Actor,
    @Body(AgentAskBodyPipe) request: AdmissionRequest,
    @Res() response: Response,
  ): Promise<void> {
    const signal = abortOnClose(response);
    const events = this.agent.ask(actor, { ...request, signal });
    const first = await firstEvent(events, signal);
    if (first === undefined) {
      response.end();
      return;
    }
    await writeEventStream(response, { first, rest: events, signal });
  }
}
