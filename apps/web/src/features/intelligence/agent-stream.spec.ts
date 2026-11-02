import {
  INTELLIGENCE_ERROR_CODES,
  SHARED_ERROR_CODES,
  type AgentAskRequest,
  type AgentEvent,
} from '@nimbo/contracts';

import { ApiClientError } from '../../lib/api-error';
import { errorResponse } from '../../lib/test-http';

import { parseSseFrames, streamAnswer } from './agent-stream';

const API = 'http://localhost/api/v1/';
const REQUEST: AgentAskRequest = { question: '¿Cuál es el plazo de entrega?' };

const CITATION: AgentEvent = {
  type: 'citation',
  ordinal: 1,
  fileId: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  versionId: '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f',
  fileName: 'Contrato.docx',
  label: 'Página 3',
  isCertain: true,
};
const DELTA: AgentEvent = { type: 'delta', text: 'El plazo es de 30 días [1].' };
const DONE: AgentEvent = { type: 'done', outcome: 'answered', used: 4, limit: 20 };
const UNAVAILABLE: AgentEvent = {
  type: 'error',
  code: INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE,
};

const frame = (event: AgentEvent): string => `data: ${JSON.stringify(event)}\n\n`;

interface StreamPlan {
  readonly chunks: readonly string[];
  /** Tras los trozos, la conexión se corta (red caída) en vez de cerrarse. */
  readonly cut?: boolean;
  /** No cierra tras los trozos: queda esperando, como un modelo que sigue escribiendo. */
  readonly hang?: boolean;
}

/** Respuesta SSE real: un `ReadableStream` que se rompe al abortar, como `fetch` en el navegador. */
function sseResponse(plan: StreamPlan, signal?: AbortSignal | null): Response {
  const encoder = new TextEncoder();
  const pending = [...plan.chunks];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () =>
        controller.error(new DOMException('Abortado', 'AbortError')),
      );
    },
    pull(controller) {
      const chunk = pending.shift();
      if (chunk !== undefined) controller.enqueue(encoder.encode(chunk));
      else if (plan.cut === true) controller.error(new TypeError('network error'));
      else if (plan.hang !== true) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const received: AgentEvent[] = [];
  for await (const event of events) received.push(event);
  return received;
}

describe('parseSseFrames (020b D-2)', () => {
  it('CA-3: devuelve los datos de cada marco completo y guarda el resto partido', () => {
    const { data, rest } = parseSseFrames(`${frame(CITATION)}data: {"type":"del`);

    expect(data).toEqual([JSON.stringify(CITATION)]);
    expect(rest).toBe('data: {"type":"del');
  });

  it('CA-3: dos marcos en un mismo trozo', () => {
    expect(parseSseFrames(frame(CITATION) + frame(DELTA)).data).toEqual([
      JSON.stringify(CITATION),
      JSON.stringify(DELTA),
    ]);
  });

  it('acepta CRLF, une varias líneas `data:` e ignora comentarios', () => {
    const { data, rest } = parseSseFrames(': latido\r\n\r\ndata: {"a":\r\ndata: 1}\r\n\r\n');

    expect(data).toEqual(['{"a":\n1}']);
    expect(rest).toBe('');
  });
});

describe('streamAnswer (020b D-1, D-2)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const renew = jest.fn<Promise<string | null>, []>();
  const auth = { getAccessToken: () => 'token-a', renew };

  const ask = (signal: AbortSignal = new AbortController().signal): AsyncIterable<AgentEvent> =>
    streamAnswer({ apiPublicUrl: API, request: REQUEST, signal, auth });

  const respondWith = (plan: StreamPlan): void => {
    fetchMock.mockImplementation((_url, init) => Promise.resolve(sseResponse(plan, init?.signal)));
  };

  beforeEach(() => {
    fetchMock.mockReset();
    renew.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-3: envía la pregunta por POST con Bearer y entrega los eventos en orden', async () => {
    const all = frame(CITATION) + frame(DELTA) + frame(DONE);
    respondWith({ chunks: [all.slice(0, 10), all.slice(10, 150), all.slice(150)] });

    await expect(collect(ask())).resolves.toEqual([CITATION, DELTA, DONE]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost/api/v1/agent/ask');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(REQUEST));
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-a');
  });

  it('CA-3: un marco partido justo en un carácter multibyte se decodifica entero', async () => {
    const bytes = new TextEncoder().encode(frame(DELTA) + frame(DONE));
    const cutAt = bytes.indexOf(0xc3) + 1;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, cutAt));
            controller.enqueue(bytes.slice(cutAt));
            controller.close();
          },
        }),
      ),
    );

    await expect(collect(ask())).resolves.toEqual([DELTA, DONE]);
  });

  it('CA-9: el evento `error` del servidor a mitad de flujo cierra la respuesta', async () => {
    respondWith({ chunks: [frame(DELTA) + frame(UNAVAILABLE)], hang: true });

    await expect(collect(ask())).resolves.toEqual([DELTA, UNAVAILABLE]);
  });

  it('CA-9: un marco inválido conserva lo recibido y termina en `AGENT_UNAVAILABLE`', async () => {
    respondWith({ chunks: [frame(DELTA), 'data: {"type":"delta","text":""}\n\n', frame(DONE)] });

    await expect(collect(ask())).resolves.toEqual([DELTA, UNAVAILABLE]);
  });

  it('CA-9: un JSON roto también es un marco inválido', async () => {
    respondWith({ chunks: ['data: {no-json\n\n'] });

    await expect(collect(ask())).resolves.toEqual([UNAVAILABLE]);
  });

  it('CA-9: un corte de red a mitad conserva lo recibido y termina en `AGENT_UNAVAILABLE`', async () => {
    respondWith({ chunks: [frame(CITATION), frame(DELTA).slice(0, 12)], cut: true });

    await expect(collect(ask())).resolves.toEqual([CITATION, UNAVAILABLE]);
  });

  it('CA-9: un flujo que se cierra sin `done` es un corte', async () => {
    respondWith({ chunks: [frame(DELTA)] });

    await expect(collect(ask())).resolves.toEqual([DELTA, UNAVAILABLE]);
  });

  it('CA-9: un error antes del flujo llega como `ApiClientError` con su `code`', async () => {
    const code = INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED;
    fetchMock.mockResolvedValue(errorResponse(code, 429));

    await expect(collect(ask())).rejects.toMatchObject({ code, status: 429 });
    await expect(collect(ask())).rejects.toBeInstanceOf(ApiClientError);
  });

  it('CA-10: ante 401 SHARED_UNAUTHENTICATED renueva una vez y repite con el token nuevo', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(SHARED_ERROR_CODES.UNAUTHENTICATED, 401));
    fetchMock.mockImplementationOnce((_url, init) =>
      Promise.resolve(sseResponse({ chunks: [frame(DELTA) + frame(DONE)] }, init?.signal)),
    );
    renew.mockResolvedValue('token-b');

    await expect(collect(ask())).resolves.toEqual([DELTA, DONE]);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(
      'Bearer token-b',
    );
  });

  it('CA-10: si el reintento vuelve a dar 401, no renueva otra vez y propaga el 401', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(errorResponse(SHARED_ERROR_CODES.UNAUTHENTICATED, 401)),
    );
    renew.mockResolvedValue('token-b');

    await expect(collect(ask())).rejects.toMatchObject({ status: 401 });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('CA-10: si no se puede renovar, propaga el 401 sin repetir', async () => {
    fetchMock.mockResolvedValue(errorResponse(SHARED_ERROR_CODES.UNAUTHENTICATED, 401));
    renew.mockResolvedValue(null);

    await expect(collect(ask())).rejects.toMatchObject({
      code: SHARED_ERROR_CODES.UNAUTHENTICATED,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('abortar a mitad termina sin evento de error y conserva lo recibido', async () => {
    respondWith({ chunks: [frame(DELTA)], hang: true });
    const controller = new AbortController();
    const received: AgentEvent[] = [];

    for await (const event of ask(controller.signal)) {
      received.push(event);
      controller.abort();
    }

    expect(received).toEqual([DELTA]);
  });

  it('abortar antes de la respuesta termina sin eventos ni error', async () => {
    fetchMock.mockImplementation((_url, init) =>
      init?.signal?.aborted === true
        ? Promise.reject(new DOMException('Abortado', 'AbortError'))
        : Promise.resolve(sseResponse({ chunks: [] })),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(collect(ask(controller.signal))).resolves.toEqual([]);
  });
});
