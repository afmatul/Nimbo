import { Inject, Injectable } from '@nestjs/common';

import type { AgentQuestion } from '../domain/agent-question';
import { CitationMarkerFilter } from '../domain/citation-marker-filter';
import type { FilteredPiece } from '../domain/citation-marker-filter';
import { AGENT_NOT_FOUND_ANSWER, buildAgentPrompt } from '../domain/prompt-builder';
import type { RetrievedFragment } from '../domain/retrieved-fragment';

import { I_LANGUAGE_MODEL } from './ports/i-language-model.port';
import type { ILanguageModel } from './ports/i-language-model.port';

/** Advertencia única cuando alguna cita tiene ubicación aproximada (CA-4, plan 020 D-5). */
export const APPROXIMATE_LOCATION_NOTICE = '\n\nLa ubicación de esta cita es aproximada.';

/** Aviso del servidor cuando el modelo responde sin ninguna cita válida (plan 020 D-5, riesgo 6). */
export const UNSUPPORTED_ANSWER_NOTICE = '\n\nNo pude respaldar esta respuesta con tus documentos.';

/** Consultas del periodo tras reservar la de esta pregunta; las lleva `done` (RN-5). */
export interface AnswerUsage {
  readonly used: number;
  readonly limit: number;
}

/** Cómo cierra la respuesta (RN-5): ambas cuentan como consulta. */
export type AnswerOutcome = 'answered' | 'not_found';

/**
 * Eventos de la respuesta (plan 020 §4) antes de pasar a SSE. La cita trae archivo, versión, etiqueta y certeza del
 * fragmento del servidor, nunca del modelo (D-5, RN-6); `fileName` va solo al navegador del dueño (S-1).
 */
export type AgentAnswerEvent =
  | {
      readonly type: 'citation';
      readonly ordinal: number;
      readonly fileId: string;
      readonly versionId: string;
      readonly fileName: string;
      readonly label: string;
      readonly isCertain: boolean;
    }
  | { readonly type: 'delta'; readonly text: string }
  | ({ readonly type: 'done'; readonly outcome: AnswerOutcome } & AnswerUsage);

/** Lo que se compone: la pregunta validada, los fragmentos recuperados (orden = ordinal) y el uso para `done`. */
export interface CompositionRequest {
  readonly question: AgentQuestion;
  readonly fragments: readonly RetrievedFragment[];
  readonly usage: AnswerUsage;
}

/** Lo visto en una respuesta para decidir su cierre: cuántas citas válidas, si alguna es incierta y el texto. */
interface AnswerTally {
  citations: number;
  uncertain: boolean;
  text: string;
}

/** El modelo contestó la frase fija de CA-3 (con o sin comillas y punto final). */
const isNotFoundAnswer = (text: string): boolean =>
  text.replace(/[«»"]/g, '').trim().replace(/\.$/, '') === AGENT_NOT_FOUND_ANSWER;

function toEvent(piece: FilteredPiece, tally: AnswerTally): AgentAnswerEvent {
  if (piece.type === 'text') {
    tally.text += piece.text;
    return { type: 'delta', text: piece.text };
  }
  const { fileId, versionId, fileName, location } = piece.fragment;
  tally.citations += 1;
  tally.uncertain ||= !location.isCertain();
  return {
    type: 'citation',
    ordinal: piece.ordinal,
    fileId,
    versionId,
    fileName,
    label: location.label(),
    isCertain: location.isCertain(),
  };
}

/** Avisos y `done` según lo que dijo el modelo (CA-3, CA-4, D-5). */
function* closing(tally: AnswerTally, usage: AnswerUsage): Generator<AgentAnswerEvent> {
  if (tally.citations > 0) {
    if (tally.uncertain) yield { type: 'delta', text: APPROXIMATE_LOCATION_NOTICE };
    yield { type: 'done', outcome: 'answered', ...usage };
    return;
  }
  if (!isNotFoundAnswer(tally.text)) yield { type: 'delta', text: UNSUPPORTED_ANSWER_NOTICE };
  yield { type: 'done', outcome: 'not_found', ...usage };
}

/**
 * Compone la respuesta del agente (plan 020 §2, fila 4): sin fragmentos responde la frase fija sin llamar al modelo
 * (CA-3, S-2); si no, une el flujo del modelo con `CitationMarkerFilter` y emite `citation` (una por ordinal, antes del
 * texto que la menciona), `delta`, la advertencia de ubicación aproximada una sola vez (CA-4) y `done`. Si el modelo
 * falla, el error se propaga tras lo ya emitido y no hay `done` (CA-15). Nada de esto se guarda ni se registra (RN-10).
 */
@Injectable()
export class AnswerComposer {
  constructor(@Inject(I_LANGUAGE_MODEL) private readonly model: ILanguageModel) {}

  async *compose(
    request: CompositionRequest,
    signal: AbortSignal,
  ): AsyncGenerator<AgentAnswerEvent> {
    if (request.fragments.length === 0) {
      yield { type: 'delta', text: AGENT_NOT_FOUND_ANSWER };
      yield { type: 'done', outcome: 'not_found', ...request.usage };
      return;
    }
    const tally: AnswerTally = { citations: 0, uncertain: false, text: '' };
    const filter = new CitationMarkerFilter(request.fragments);
    const prompt = buildAgentPrompt(request.question, request.fragments);
    for await (const chunk of this.model.stream(prompt, signal)) {
      yield* filter.push(chunk).map((piece) => toEvent(piece, tally));
    }
    yield* filter.finish().map((piece) => toEvent(piece, tally));
    yield* closing(tally, request.usage);
  }
}
