import { HttpStatus } from '@nestjs/common';
import { INTELLIGENCE_ERROR_CODES } from '@nimbo/contracts';
import type { AgentErrorEvent, AgentEvent } from '@nimbo/contracts';
import type { Response } from 'express';

import type { AgentAnswerEvent } from '../application/answer-composer';

/**
 * Cabeceras del flujo (plan 020 §4, D-6): `no-store` porque lleva contenido, citas y nombres de archivo; `no-transform`
 * y `X-Accel-Buffering: no` para que ningún proxy comprima ni acumule el flujo (CA-2).
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
};

/** El proveedor falló con texto ya enviado (CA-15): el cliente lo sabe por este evento, no por el estado HTTP. */
const UNAVAILABLE_EVENT: AgentErrorEvent = {
  type: 'error',
  code: INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE,
};

/** Respuesta ya admitida: su primer evento (los errores previos salieron como HTTP) y el resto del flujo. */
export interface OpenedAnswer {
  readonly first: AgentAnswerEvent;
  readonly rest: AsyncIterable<AgentAnswerEvent>;
  readonly signal: AbortSignal;
}

/**
 * Señal que se aborta si quien pregunta cierra la petición antes de que termine la respuesta (P-9, S-4); tras el fin
 * normal, el `close` del socket ya no aborta nada.
 */
export function abortOnClose(response: Response): AbortSignal {
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  return controller.signal;
}

const frameOf = (event: AgentEvent): string => `data: ${JSON.stringify(event)}\n\n`;

/**
 * Escribe la respuesta como `text/event-stream` (plan 020 D-6): un marco `data:` JSON por evento, enviado en cuanto
 * llega (sin buffering, CA-2). Si el flujo falla a mitad, cierra con el evento `error` (CA-15); si quien pregunta
 * cancela, deja de escribir. Nunca registra lo que escribe (CA-18).
 */
export async function writeEventStream(response: Response, answer: OpenedAnswer): Promise<void> {
  response.status(HttpStatus.OK).set(SSE_HEADERS);
  response.flushHeaders();
  try {
    response.write(frameOf(answer.first));
    for await (const event of answer.rest) {
      if (answer.signal.aborted) break;
      response.write(frameOf(event));
    }
  } catch {
    // La bitácora `agent.asked` ya registró el resultado; aquí solo se avisa al cliente.
    if (!answer.signal.aborted) response.write(frameOf(UNAVAILABLE_EVENT));
  } finally {
    response.end();
  }
}
