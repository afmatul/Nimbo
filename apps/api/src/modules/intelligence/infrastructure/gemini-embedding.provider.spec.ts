import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { itBehavesAsEmbeddingProvider } from '../../../../test/support/embedding-provider.contract';
import { EMBEDDING_DIMENSIONS } from '../application/ports/i-embedding-provider.port';
import { EmbeddingUnavailableError } from '../domain/errors';

import { GeminiEmbeddingProvider, type GeminiEmbeddingConfig } from './gemini-embedding.provider';

const API_KEY = 'clave-secreta-de-prueba';
const MODEL = 'gemini-embedding-001';

interface GeminiRequestBody {
  readonly requests: readonly {
    readonly model: string;
    readonly content: { readonly parts: readonly { readonly text: string }[] };
    readonly outputDimensionality: number;
    readonly taskType: string;
  }[];
}

interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly apiKey: string | undefined;
  readonly body: GeminiRequestBody;
}

type Reply = (body: GeminiRequestBody, res: ServerResponse) => void;

/** Vector sin normalizar (norma ≠ 1) que depende del texto: el proveedor debe normalizarlo. */
const rawVector = (text: string): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_v, index) => ((text.length + index) % 7) + 1);

const embeddingsReply: Reply = (body, res) => {
  const embeddings = body.requests.map((request) => ({
    values: rawVector(request.content.parts[0]?.text ?? ''),
  }));
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ embeddings }));
};

const statusReply =
  (status: number): Reply =>
  (_body, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `fallo con ${API_KEY}` } }));
  };

/** Servidor HTTP local que imita `batchEmbedContents` y recuerda cada petición. */
class FakeGeminiServer {
  readonly received: ReceivedRequest[] = [];
  reply: Reply = embeddingsReply;
  private readonly server: Server = createServer((req, res) => void this.handle(req, res));

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v1beta`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as GeminiRequestBody;
    const apiKey = req.headers['x-goog-api-key'];
    this.received.push({
      method: req.method ?? '',
      url: req.url ?? '',
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      body,
    });
    this.reply(body, res);
  }
}

describe('GeminiEmbeddingProvider', () => {
  const server = new FakeGeminiServer();
  let config: GeminiEmbeddingConfig;
  const provider = (overrides: Partial<GeminiEmbeddingConfig> = {}) =>
    new GeminiEmbeddingProvider({ ...config, ...overrides });

  beforeAll(async () => {
    config = { apiKey: API_KEY, model: MODEL, baseUrl: await server.start() };
  });
  afterAll(() => server.stop());
  beforeEach(() => {
    server.received.length = 0;
    server.reply = embeddingsReply;
  });

  itBehavesAsEmbeddingProvider(() => provider());

  it('CA-12, RN-9: llama a `batchEmbedContents` con la clave en la cabecera, nunca en la URL', async () => {
    await provider().embed(['hola']);

    const [request] = server.received;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe(`/v1beta/models/${MODEL}:batchEmbedContents`);
    expect(request?.url).not.toContain(API_KEY);
    expect(request?.apiKey).toBe(API_KEY);
  });

  it('pide 768 dimensiones del modelo configurado, por omisión para documentos', async () => {
    await provider().embed(['hola']);

    expect(server.received[0]?.body.requests).toEqual([
      {
        model: `models/${MODEL}`,
        content: { parts: [{ text: 'hola' }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    ]);
  });

  it.each([
    ['document', 'RETRIEVAL_DOCUMENT'],
    ['query', 'RETRIEVAL_QUERY'],
  ] as const)("020 D-8: `task: '%s'` → `taskType` %s", async (task, taskType) => {
    await provider().embed(['hola'], task);

    expect(server.received[0]?.body.requests[0]?.taskType).toBe(taskType);
  });

  it('reparte en lotes de hasta 100 textos', async () => {
    await provider().embed(Array.from({ length: 250 }, (_v, index) => `t${index}`));

    expect(server.received.map((request) => request.body.requests.length)).toEqual([100, 100, 50]);
  });

  it('normaliza cada vector (L2): obligatorio por debajo de la dimensión nativa', async () => {
    server.reply = (_body, res) => {
      const values = [3, 4, ...Array<number>(EMBEDDING_DIMENSIONS - 2).fill(0)];
      res.writeHead(200).end(JSON.stringify({ embeddings: [{ values }] }));
    };

    const [vector] = await provider().embed(['hola']);

    expect(vector?.slice(0, 3)).toEqual([0.6, 0.8, 0]);
  });

  it.each([408, 429, 500, 503])(
    'CA-12: HTTP %i → `EmbeddingUnavailableError` reintentable, sin la clave ni la respuesta',
    async (status) => {
      server.reply = statusReply(status);

      const error = await provider()
        .embed(['hola'])
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(EmbeddingUnavailableError);
      expect(error).toMatchObject({ retryable: true, reason: 'proveedor_no_disponible' });
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
    },
  );

  it.each([400, 401, 403])(
    'CA-12: HTTP %i (clave inválida o petición rechazada) → no reintentable',
    async (status) => {
      server.reply = statusReply(status);

      await expect(provider().embed(['hola'])).rejects.toMatchObject({
        name: 'EmbeddingUnavailableError',
        retryable: false,
      });
    },
  );

  it('CA-12: una respuesta con otra dimensión o mal formada → reintentable', async () => {
    server.reply = (_body, res) => {
      res.writeHead(200).end(JSON.stringify({ embeddings: [{ values: [1, 2, 3] }] }));
    };

    await expect(provider().embed(['hola'])).rejects.toMatchObject({
      name: 'EmbeddingUnavailableError',
      retryable: true,
    });
  });

  it('CA-12: la red caída → reintentable, sin la clave en el error', async () => {
    const unreachable = provider({ baseUrl: 'http://127.0.0.1:1/v1beta' });

    const error = await unreachable.embed(['hola']).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ name: 'EmbeddingUnavailableError', retryable: true });
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(API_KEY);
  });

  it('CA-12: sin clave → no reintentable `proveedor_no_disponible` y no sale nada a la red', async () => {
    await expect(provider({ apiKey: undefined }).embed(['hola'])).rejects.toMatchObject({
      name: 'EmbeddingUnavailableError',
      reason: 'proveedor_no_disponible',
      retryable: false,
    });
    expect(server.received).toHaveLength(0);
  });
});
