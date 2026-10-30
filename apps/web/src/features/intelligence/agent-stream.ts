import {
  agentEventSchema,
  INTELLIGENCE_ERROR_CODES,
  type AgentAskRequest,
  type AgentEvent,
} from '@nimbo/contracts';

import { errorFromResponse, sendRequest } from '../../lib/api-client';
import { isUnauthenticated, withBearer, type AuthFetchDeps } from '../identity/session/auth-fetch';

import { agentEndpoint } from './agent-api';

const ASK_PATH = '/agent/ask';
const EVENT_STREAM = 'text/event-stream';
const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const DATA_FIELD = /^data: ?/;

/**
 * Cierre ante un marco inválido o un corte a mitad (D-2, CA-9): el mismo evento que manda el servidor cuando el modelo
 * falla con texto ya enviado, así quien consume conserva lo recibido y no distingue la causa.
 */
const UNAVAILABLE_EVENT: AgentEvent = {
  type: 'error',
  code: INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE,
};

/** Marcos completos del búfer (solo sus datos) y lo que queda partido para el siguiente trozo. */
export interface SseFrames {
  readonly data: readonly string[];
  readonly rest: string;
}

/** Une las líneas `data:` de un marco; `null` si no tiene ninguna (comentario o latido). */
function dataOf(frame: string): string | null {
  const lines = frame.split(LINE_SEPARATOR).filter((line) => DATA_FIELD.test(line));
  return lines.length === 0 ? null : lines.map((line) => line.replace(DATA_FIELD, '')).join('\n');
}

/** Parte un búfer `text/event-stream` por línea en blanco (D-2). Pura: no sabe de `fetch` ni de eventos. */
export function parseSseFrames(buffer: string): SseFrames {
  const pieces = buffer.split(FRAME_SEPARATOR);
  const rest = pieces.pop() ?? '';
  return { data: pieces.map(dataOf).filter((data) => data !== null), rest };
}

/** Evento validado con el contrato de la 020; `null` si el JSON está roto o no cumple el esquema. */
function parseAgentEvent(data: string): AgentEvent | null {
  try {
    const parsed = agentEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const isFinal = (event: AgentEvent): boolean => event.type === 'done' || event.type === 'error';

/** Eventos de los marcos hasta el primero que cierra la respuesta; un marco inválido la cierra como no disponible. */
function eventsOf(frames: readonly string[]): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const data of frames) {
    const event = parseAgentEvent(data) ?? UNAVAILABLE_EVENT;
    events.push(event);
    if (isFinal(event)) break;
  }
  return events;
}

/** Trozos de texto del cuerpo; cancela la lectura si quien consume deja de pedir (fin de la respuesta). */
async function* decodedChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      yield decoder.decode(read.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Eventos del flujo hasta `done` o `error`. Un corte o un cierre sin `done` termina en no disponible; abortar, en nada. */
async function* readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  let buffer = '';
  try {
    for await (const text of decodedChunks(body)) {
      const frames = parseSseFrames(buffer + text);
      buffer = frames.rest;
      const events = eventsOf(frames.data);
      yield* events;
      if (events.some(isFinal)) return;
    }
  } catch {
    // Corte de red a mitad (o aborto): se resuelve abajo según la señal.
  }
  if (!signal.aborted) yield UNAVAILABLE_EVENT;
}

/** Entrada de `streamAnswer`: la pregunta, la señal de «Detener» y el token en memoria con su renovación. */
export interface StreamAnswerInput {
  readonly apiPublicUrl: string;
  readonly request: AgentAskRequest;
  readonly signal: AbortSignal;
  readonly auth: AuthFetchDeps;
}

/** Un `POST /agent/ask` con el token dado: el cuerpo del flujo, o el error previo al flujo con su `code` (D-1). */
async function ask(input: StreamAnswerInput, token: string | null): Promise<Response> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input.request),
    signal: input.signal,
  };
  const url = agentEndpoint(input.apiPublicUrl, ASK_PATH);
  const { response, correlationId } = await sendRequest(url, withBearer(init, token), EVENT_STREAM);
  if (!response.ok) throw await errorFromResponse(response, correlationId);
  return response;
}

/**
 * Como `createAuthFetch`: solo un `401 SHARED_UNAUTHENTICATED` renueva y repite una vez (CA-10); si la renovación
 * falla se propaga el `401` original. Se repite aquí porque `authFetch` lee JSON y no sirve para el flujo (D-1).
 */
async function askWithRenewal(input: StreamAnswerInput): Promise<Response> {
  try {
    return await ask(input, input.auth.getAccessToken());
  } catch (caught) {
    if (!isUnauthenticated(caught)) throw caught;
    const token = await input.auth.renew();
    if (token === null) throw caught;
    return ask(input, token);
  }
}

/**
 * Respuesta del agente como eventos validados (D-1, D-2): `citation`, `delta`, `done` o `error`. Antes del flujo, un
 * no-2xx se lanza como `ApiClientError` con su `code`; a mitad, un marco inválido o un corte cierran con `error`
 * `AGENT_UNAVAILABLE` tras lo ya entregado (CA-9). Abortar con la señal termina sin más eventos ni error.
 */
export async function* streamAnswer(input: StreamAnswerInput): AsyncGenerator<AgentEvent, void> {
  let response: Response;
  try {
    response = await askWithRenewal(input);
  } catch (caught) {
    if (input.signal.aborted) return;
    throw caught;
  }
  if (response.body === null) yield UNAVAILABLE_EVENT;
  else yield* readEvents(response.body, input.signal);
}
