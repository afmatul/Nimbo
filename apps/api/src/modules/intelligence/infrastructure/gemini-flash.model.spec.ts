import {
  collectChunks,
  itBehavesAsLanguageModel,
} from '../../../../test/support/language-model.contract';
import { AgentUnavailableError } from '../domain/errors';

import { GeminiFlashModel, type GeminiChatConfig } from './gemini-flash.model';

const API_KEY = 'clave-secreta-de-prueba';
const MODEL = 'gemini-3.5-flash';
const BASE_URL = 'https://gemini.prueba/v1beta';
const SHORT_TIMEOUT_MS = 30;
const PROMPT = { system: 'Responde solo con los fragmentos.', user: '¿Cuándo vence?' };

const CONFIG: GeminiChatConfig = {
  apiKey: API_KEY,
  model: MODEL,
  baseUrl: BASE_URL,
  firstChunkTimeoutMs: 1_000,
  idleTimeoutMs: 1_000,
};

/** Un evento SSE de `streamGenerateContent?alt=sse` con un trozo de texto. */
const sseEvent = (text: string): string =>
  `data: ${JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  })}\r\n\r\n`;

/** Cuerpo que entrega cada pieza como un trozo de red y, si `stall`, se queda abierto sin más datos. */
function bodyOf(pieces: readonly string[], stall = false): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((piece) => controller.enqueue(encoder.encode(piece)));
      if (!stall) controller.close();
    },
  });
}

const sseResponse = (pieces: readonly string[], stall = false): Response =>
  new Response(bodyOf(pieces, stall), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

/** `fetch` que no responde hasta que su señal se aborta (proveedor colgado). */
const hangingFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

const model = (overrides: Partial<GeminiChatConfig> = {}) =>
  new GeminiFlashModel({ ...CONFIG, ...overrides });

const ask = (subject: GeminiFlashModel): Promise<string[]> =>
  collectChunks(subject.stream(PROMPT, new AbortController().signal));

describe('GeminiFlashModel', () => {
  let fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  itBehavesAsLanguageModel((chunks) => {
    fetchMock.mockResolvedValue(sseResponse(chunks.map(sseEvent)));
    return model();
  });

  it('CA-15: pide `streamGenerateContent` en SSE con la clave en la cabecera, nunca en la URL', async () => {
    fetchMock.mockResolvedValue(sseResponse([sseEvent('hola')]));

    await ask(model());

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/models/${MODEL}:streamGenerateContent?alt=sse`);
    expect(String(url)).not.toContain(API_KEY);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(API_KEY);
  });

  it('pide pensamiento mínimo para que el primer trozo llegue rápido (CA-2)', async () => {
    fetchMock.mockResolvedValue(sseResponse([sseEvent('hola')]));

    await ask(model());

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      systemInstruction: { parts: [{ text: PROMPT.system }] },
      contents: [{ role: 'user', parts: [{ text: PROMPT.user }] }],
      generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } },
    });
  });

  it('une eventos partidos entre trozos de red y omite los que no traen texto', async () => {
    const event = sseEvent('vence en marzo');
    const empty = `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}\n\n`;
    fetchMock.mockResolvedValue(sseResponse([event.slice(0, 20), event.slice(20), empty]));

    expect(await ask(model())).toEqual(['vence en marzo']);
  });

  it('CA-15: sin clave → `AgentUnavailableError` sin salir a la red', async () => {
    await expect(ask(model({ apiKey: undefined }))).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 429, 500, 503])(
    'CA-15: HTTP %i → `AgentUnavailableError`, sin la clave ni la respuesta del proveedor',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(`{"error":"${API_KEY}"}`, { status }));

      const error = await ask(model()).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AgentUnavailableError);
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
    },
  );

  it('CA-15: la red caída → `AgentUnavailableError`', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed ${API_KEY}`));

    const error = await ask(model()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
  });

  it('CA-15: un evento con error o mal formado → `AgentUnavailableError`', async () => {
    fetchMock.mockResolvedValue(sseResponse([sseEvent('hola'), 'data: {no es json\n\n']));

    await expect(ask(model())).rejects.toBeInstanceOf(AgentUnavailableError);
  });

  it('CA-15: vence el plazo al primer trozo → `AgentUnavailableError`', async () => {
    fetchMock.mockImplementation(hangingFetch);

    await expect(ask(model({ firstChunkTimeoutMs: SHORT_TIMEOUT_MS }))).rejects.toBeInstanceOf(
      AgentUnavailableError,
    );
  });

  it('CA-15: el proveedor responde pero no manda el primer trozo a tiempo → `AgentUnavailableError`', async () => {
    fetchMock.mockResolvedValue(sseResponse([], true));

    await expect(ask(model({ firstChunkTimeoutMs: SHORT_TIMEOUT_MS }))).rejects.toBeInstanceOf(
      AgentUnavailableError,
    );
  });

  it('CA-15: vence el plazo entre trozos → `AgentUnavailableError` después de lo ya entregado', async () => {
    fetchMock.mockResolvedValue(sseResponse([sseEvent('El contrato ')], true));
    const received: string[] = [];

    const consume = async (): Promise<void> => {
      const stream = model({ idleTimeoutMs: SHORT_TIMEOUT_MS }).stream(
        PROMPT,
        new AbortController().signal,
      );
      for await (const chunk of stream) received.push(chunk);
    };

    await expect(consume()).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(received).toEqual(['El contrato ']);
  });
});
