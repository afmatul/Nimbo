import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { ILanguageModel } from '../application/ports/i-language-model.port';
import { AgentUnavailableError } from '../domain/errors';
import type { AgentPrompt } from '../domain/prompt-builder';

import { postToGemini } from './gemini-http';

/**
 * `GEMINI_API_KEY` (opcional, secreta), `GEMINI_CHAT_MODEL` y los dos plazos del modelo (`AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS`,
 * `AGENT_MODEL_IDLE_TIMEOUT_MS`; 020 D-7, D-8). Solo los lee el `api`.
 */
export interface GeminiChatConfig {
  readonly apiKey: string | undefined;
  readonly model: string;
  readonly baseUrl: string;
  readonly firstChunkTimeoutMs: number;
  readonly idleTimeoutMs: number;
}

export const GEMINI_CHAT_CONFIG = Symbol('GeminiChatConfig');

/** `streamGenerateContent` en Server-Sent Events: un evento por trozo de la respuesta. */
const STREAM_METHOD = 'streamGenerateContent?alt=sse';
const EVENT_SEPARATOR = '\n\n';
const DATA_PREFIX = /^data: ?/;

/** Solo lo que se usa de cada evento; Gemini agrega otros campos (`usageMetadata`, `modelVersion`…). */
const streamEventSchema = z.object({
  error: z.unknown().optional(),
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .optional(),
});

/** Plazo que se rearma con cada trozo; al vencer aborta su señal. */
class Deadline {
  private readonly controller = new AbortController();
  private timer: NodeJS.Timeout | undefined;
  readonly signal = this.controller.signal;

  arm(ms: number): void {
    this.clear();
    this.timer = setTimeout(() => this.controller.abort(), ms);
  }

  clear(): void {
    clearTimeout(this.timer);
  }
}

/** Texto de un evento SSE (sus líneas `data:`); un evento con `error` o que no es JSON es un fallo del proveedor. */
function textOf(event: string): string {
  const data = event
    .split('\n')
    .filter((line) => DATA_PREFIX.test(line))
    .map((line) => line.replace(DATA_PREFIX, ''))
    .join('\n');
  if (data === '') return '';
  const parsed = streamEventSchema.safeParse(safeJson(data));
  if (!parsed.success || parsed.data.error !== undefined) throw new AgentUnavailableError();
  const parts = parsed.data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('');
}

function safeJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Eventos SSE crudos del cuerpo, aunque lleguen partidos entre trozos de red. Abortar `signal` corta la lectura; al
 * terminar, por fin o porque quien consume se detuvo, se libera el cuerpo.
 */
async function* sseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const cancel = (): void => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      const events = (pending + decoder.decode(read.value, { stream: true }))
        .replace(/\r\n/g, '\n')
        .split(EVENT_SEPARATOR);
      pending = events.pop() ?? '';
      yield* events;
    }
    signal.throwIfAborted();
    if (pending.trim() !== '') yield pending;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}

/** Trozos de texto de la respuesta, sin los eventos vacíos; revisa `signal` antes de entregar cada uno. */
async function* textsOf(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  for await (const event of sseEvents(body, signal)) {
    const text = textOf(event);
    signal.throwIfAborted();
    if (text !== '') yield text;
  }
}

/** Medido en T-10: con pensamiento mínimo el primer trozo baja de ~3.5 s a ~1 s; el agente responde con fragmentos ya recuperados. */
const THINKING_CONFIG = { thinkingConfig: { thinkingLevel: 'minimal' } } as const;

/**
 * `ILanguageModel` sobre la API REST de Gemini con `fetch`, sin SDK (ADR-0007, ADR-0033 c; 020 D-7). Dos plazos: hasta el
 * primer trozo y entre trozos (el tiempo que tarda quien consume no cuenta). Fallo, plazo vencido, respuesta mal formada
 * o falta de clave → `AgentUnavailableError` sin la respuesta del proveedor; cancelar con `signal` lanza su motivo.
 */
@Injectable()
export class GeminiFlashModel implements ILanguageModel {
  constructor(@Inject(GEMINI_CHAT_CONFIG) private readonly config: GeminiChatConfig) {}

  async *stream(prompt: AgentPrompt, signal: AbortSignal): AsyncGenerator<string> {
    const apiKey = this.config.apiKey;
    if (apiKey === undefined) throw new AgentUnavailableError();
    const deadline = new Deadline();
    deadline.arm(this.config.firstChunkTimeoutMs);
    const combined = AbortSignal.any([signal, deadline.signal]);
    try {
      const body = await this.open(apiKey, prompt, combined);
      for await (const text of textsOf(body, combined)) {
        deadline.clear();
        yield text;
        deadline.arm(this.config.idleTimeoutMs);
      }
    } catch {
      throw signal.aborted ? signal.reason : new AgentUnavailableError();
    } finally {
      deadline.clear();
    }
  }

  private async open(
    apiKey: string,
    prompt: AgentPrompt,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await postToGemini(
      {
        baseUrl: this.config.baseUrl,
        model: this.config.model,
        method: STREAM_METHOD,
        apiKey,
        body: {
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: THINKING_CONFIG,
        },
      },
      signal,
    );
    if (response.ok && response.body !== null) return response.body;
    await response.body?.cancel();
    throw new AgentUnavailableError();
  }
}
