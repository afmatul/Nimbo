import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { getQueueToken } from '@nestjs/bullmq';
import { completeUploadResponseSchema, previewUrlResponseSchema } from '@nimbo/contracts';
import { RedisContainer } from '@testcontainers/redis';
import type { StartedRedisContainer } from '@testcontainers/redis';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { Response } from 'supertest';

import { StoragePreviewFacade } from '../../../src/modules/storage';
import { I_NODE_REPOSITORY } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import type { INodeRepository } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from '../../../src/modules/storage/application/ports/i-object-storage.port';
import type { IObjectStorage } from '../../../src/modules/storage/application/ports/i-object-storage.port';
import { TRASH_PURGE_QUEUE } from '../../../src/modules/storage/infrastructure/trash-purge.scheduler';
import { FixedClock, I_RATE_LIMITER, Role } from '../../../src/shared';
import type { IRateLimiter } from '../../../src/shared';
import { REDIS_CLIENT } from '../../../src/shared/infrastructure/redis/redis-client.provider';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { REDIS_IMAGE } from '../setup/containers';
import type { LogLine } from '../setup/log-sink';

import { createStorageHttpApp, textBytes } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

const LIMIT = 2;
const WINDOW_SECONDS = 60;
const RESPONSE_TIMEOUT_MS = 5000;
const REQUEST_DEADLINE_MS = 10000;
const MAX_FAILURE_RESPONSE_MS = 2500;
const PRIVATE_NAME = 'PRIVADO-operacion.txt';
const COOKIE_SECRET = 'COOKIE_PRIVADA_preview';
const DOWN_CORRELATION_ID = 'preview-real-redis-down';
const TOO_MANY_MESSAGE = 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';
const INTERNAL_MESSAGE =
  'Ocurrió un error inesperado. Inténtalo de nuevo más tarde; si persiste, contacta a soporte con el identificador de correlación.';
const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

const secretsOf = (url: string): string[] => {
  const path = decodeURIComponent(new URL(url).pathname);
  return [url, path, path.split('/').slice(2).join('/')];
};

const uploaded = async (client: StorageClient) => {
  const response = await client.upload(PRIVATE_NAME, textBytes(128), 'keep_both');
  expect(response.status).toBe(200);
  return completeUploadResponseSchema.parse(response.body).file;
};

const expectPrivateLogs = (storage: StorageHttpApp, secrets: readonly string[]): void => {
  const serialized = JSON.stringify(storage.testApp.logs.lines());
  for (const secret of [...secrets, PRIVATE_NAME, COOKIE_SECRET, 'Bearer ', 'X-Amz-Signature']) {
    expect(serialized.includes(secret)).toBe(false);
  }
};

const hasLog = (lines: readonly LogLine[], fields: Record<string, unknown>): boolean =>
  lines.some((line) => expect.objectContaining(fields).asymmetricMatch(line));

/** Solo observación: los spies conservan las implementaciones reales. */
const observeDelivery = (storage: StorageHttpApp) => ({
  limiter: jest.spyOn(storage.testApp.app.get<IRateLimiter>(I_RATE_LIMITER), 'consume'),
  facade: jest.spyOn(storage.testApp.app.get(StoragePreviewFacade), 'issueUrl'),
  nodes: jest.spyOn(
    storage.testApp.app.get<INodeRepository>(I_NODE_REPOSITORY),
    'findAccessibleById',
  ),
  objects: jest.spyOn(storage.testApp.app.get<IObjectStorage>(I_OBJECT_STORAGE), 'presignDownload'),
});

type RedisDownScenario = {
  readonly fileId: string;
  readonly token: string;
  readonly url: string;
  readonly observed: ReturnType<typeof observeDelivery>;
  readonly redisEvents: readonly string[];
};

const expectNoDelivery = (observed: RedisDownScenario['observed']): void => {
  expect(observed.limiter).toHaveBeenCalledTimes(1);
  expect(observed.facade).toHaveBeenCalledTimes(0);
  expect(observed.nodes).toHaveBeenCalledTimes(0);
  expect(observed.objects).toHaveBeenCalledTimes(0);
};

const consumedPromise = (observed: RedisDownScenario['observed']): Promise<unknown> => {
  const result: unknown = observed.limiter.mock.results[0]?.value;
  if (!(result instanceof Promise)) throw new Error('Falta el Promise del consume real');
  return result;
};

/** Diagnóstico de opciones y nombres de comandos; nunca URL, credenciales ni argumentos. */
const redisStateOf = (storage: StorageHttpApp) => {
  const redis = storage.testApp.app.get<Redis>(REDIS_CLIENT);
  const options = redis.options;
  return {
    status: redis.status,
    options: {
      maxRetriesPerRequest: options.maxRetriesPerRequest,
      enableOfflineQueue: options.enableOfflineQueue,
      connectTimeout: options.connectTimeout,
      commandTimeout: options.commandTimeout ?? null,
      socketTimeout: options.socketTimeout ?? null,
      lazyConnect: options.lazyConnect,
      enableReadyCheck: options.enableReadyCheck,
      retryDelaysMs: [1, 2, 40].map((attempt) => options.retryStrategy?.(attempt)),
    },
    pendingCommands: redis.commandQueue.toArray().map(({ command }) => command.name),
  };
};

const diagnoseRedisTimeout = async (
  storage: StorageHttpApp,
  scenario: RedisDownScenario,
  elapsedMs: number,
): Promise<never> => {
  expectNoDelivery(scenario.observed);
  expectPrivateLogs(storage, [...secretsOf(scenario.url), scenario.token]);
  const settled = await Promise.race([
    consumedPromise(scenario.observed).then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => setImmediate(() => resolve(false))),
  ]);
  expect(settled).toBe(false);
  const evidence = { elapsedMs, ...redisStateOf(storage), events: scenario.redisEvents };
  throw new Error(
    `Redis detenido: consume real pendiente, sin lookup ni firma: ${JSON.stringify(evidence)}`,
  );
};

const requestAfterRedisStop = async (
  storage: StorageHttpApp,
  scenario: RedisDownScenario,
): Promise<Response> => {
  const startedAt = performance.now();
  try {
    return await request(storage.testApp.app.getHttpServer())
      .post(`/api/v1/files/${scenario.fileId}/preview-url`)
      .auth(scenario.token, { type: 'bearer' })
      .set('Cookie', COOKIE_SECRET)
      .set('x-correlation-id', DOWN_CORRELATION_ID)
      .timeout({ response: RESPONSE_TIMEOUT_MS, deadline: REQUEST_DEADLINE_MS });
  } catch (failure: unknown) {
    if (
      typeof failure === 'object' &&
      failure !== null &&
      'timeout' in failure &&
      failure.timeout === RESPONSE_TIMEOUT_MS
    ) {
      return diagnoseRedisTimeout(storage, scenario, Math.round(performance.now() - startedAt));
    }
    throw new Error('Falló el transporte de preview tras detener Redis');
  }
};

const expectRedisFailureResponse = (response: Response): void => {
  expect(response.status).toBe(500);
  const expected = {
    code: 'INTERNAL_ERROR',
    message: INTERNAL_MESSAGE,
    correlationId: DOWN_CORRELATION_ID,
  };
  expect(expect.arrayContaining([expected]).asymmetricMatch([response.body])).toBe(true);
};

const expectRedisFailureEvents = (lines: readonly LogLine[], fileId: string): void => {
  expect(hasLog(lines, { event: 'preview.url_failed', fileId, reason: 'unexpected_error' })).toBe(
    true,
  );
  expect(hasLog(lines, { event: 'http.unhandled_error' })).toBe(true);
  expect(
    hasLog(lines, { event: 'http.request', res: expect.objectContaining({ statusCode: 500 }) }),
  ).toBe(true);
  expect(
    lines.some((line) =>
      ['preview.url_issued', 'preview.rate_limited', 'http.domain_error'].includes(
        String(line.event),
      ),
    ),
  ).toBe(false);
  for (const line of lines) expect(line.correlationId).toBe(DOWN_CORRELATION_ID);
};

const expectRedisFailureLogs = async (
  storage: StorageHttpApp,
  scenario: RedisDownScenario,
): Promise<Error> => {
  const original: unknown = await consumedPromise(scenario.observed).catch(
    (error: unknown) => error,
  );
  expect(original instanceof Error).toBe(true);
  if (!(original instanceof Error)) throw new Error('El Redis detenido no produjo un Error');
  expectRedisFailureEvents(
    storage.testApp.logs.withCorrelationId(DOWN_CORRELATION_ID),
    scenario.fileId,
  );
  expectPrivateLogs(storage, [
    ...secretsOf(scenario.url),
    scenario.token,
    original.message,
    original.stack ?? 'STACK_AUSENTE',
  ]);
  return original;
};

/** La caída tiene contenedor/app propios y se ejecuta antes de los casos no destructivos. */
describe('017 T-04: caída real de Redis aislada (CA-10, CA-12)', () => {
  let redis: StartedRedisContainer;
  let storage: StorageHttpApp;
  let redisStopped = false;

  beforeAll(async () => {
    redis = await new RedisContainer(REDIS_IMAGE).start();
    storage = await createStorageHttpApp({
      preview: true,
      env: {
        REDIS_URL: redis.getConnectionUrl(),
        RATE_LIMIT_PREVIEW_URL_PER_MINUTE: String(LIMIT),
        RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: String(LIMIT),
      },
    });
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    const socket = storage?.testApp.app.get<Redis>(REDIS_CLIENT).stream;
    const closed =
      socket === undefined || socket.closed
        ? Promise.resolve()
        : new Promise<void>((resolve) => socket.once('close', () => resolve()));
    // Nest desconecta Redis; un cliente en reconexión puede tener el socket ya cerrado y no emitir otro end.
    (storage?.testApp.app.getHttpServer() as Server | undefined)?.closeAllConnections();
    try {
      await storage?.close();
      await closed;
    } finally {
      if (redis !== undefined && !redisStopped) await redis.stop();
    }
  });

  it('CA-10, CA-12: Redis realmente detenido falla cerrado con 500 canónico sin lookup, firma ni error privado', async () => {
    const client = await storage.newClient();
    const file = await uploaded(client);
    const before = await client.previewUrl(file.id);
    expect(before.status).toBe(200);
    const redisEvents: string[] = [];
    const redisClient = storage.testApp.app.get<Redis>(REDIS_CLIENT);
    for (const event of ['close', 'reconnecting', 'connecting', 'connect', 'ready', 'end']) {
      redisClient.on(event, () => redisEvents.push(event));
    }
    const scenario: RedisDownScenario = {
      fileId: file.id,
      url: previewUrlResponseSchema.parse(before.body).url,
      token: tokens.forRole(Role.CLIENT, client.id),
      observed: observeDelivery(storage),
      redisEvents,
    };
    // La cola ajena al caso se cierra únicamente en esta app dedicada.
    await storage.testApp.app.get<Queue>(getQueueToken(TRASH_PURGE_QUEUE)).close();
    await redis.stop();
    redisStopped = true;
    storage.testApp.logs.clear();

    const startedAt = performance.now();
    const response = await requestAfterRedisStop(storage, scenario);
    const responseMs = Math.round(performance.now() - startedAt);

    expectRedisFailureResponse(response);
    expect(responseMs).toBeLessThan(MAX_FAILURE_RESPONSE_MS);
    expectNoDelivery(scenario.observed);
    const original = await expectRedisFailureLogs(storage, scenario);
    const rejection = original.message === 'Command timed out' ? 'command-timeout' : 'redis-error';
    process.stdout.write(
      `${JSON.stringify({ event: 'preview.redis_down.observed', responseMs, status: response.status, rejection })}\n`,
    );
  });
});

describe('017 T-04: operación de preview con Redis real (CA-10, CA-12)', () => {
  let redis: StartedRedisContainer;
  let storage: StorageHttpApp;

  beforeAll(async () => {
    redis = await new RedisContainer(REDIS_IMAGE).start();
    storage = await createStorageHttpApp({
      preview: true,
      env: {
        REDIS_URL: redis.getConnectionUrl(),
        RATE_LIMIT_PREVIEW_URL_PER_MINUTE: String(LIMIT),
        RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: String(LIMIT),
      },
    });
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    try {
      await storage?.close();
    } finally {
      if (redis !== undefined) await redis.stop();
    }
  });

  const expectLimited = (response: Response) => {
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'STORAGE_TOO_MANY_REQUESTS',
      message: TOO_MANY_MESSAGE,
    });
    const retryAfter = Number(response.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW_SECONDS);
  };

  it('CA-12: A agota preview sin limitar B ni ejecutar storage después del 429', async () => {
    const a = await storage.newClient();
    const b = await storage.newClient();
    const fileA = await uploaded(a);
    const fileB = await uploaded(b);
    storage.testApp.logs.clear();
    const urls: string[] = [];
    for (let count = 0; count < LIMIT; count += 1) {
      const response = await a.previewUrl(fileA.id);
      expect(response.status).toBe(200);
      urls.push(previewUrlResponseSchema.parse(response.body).url);
    }
    const facade = jest.spyOn(storage.testApp.app.get(StoragePreviewFacade), 'issueUrl');
    const nodes = jest.spyOn(
      storage.testApp.app.get<INodeRepository>(I_NODE_REPOSITORY),
      'findAccessibleById',
    );
    expectLimited(await a.previewUrl(randomUUID()));
    expect(facade).toHaveBeenCalledTimes(0);
    expect(nodes).toHaveBeenCalledTimes(0);
    const independent = await b.previewUrl(fileB.id);
    expect(independent.status).toBe(200);
    urls.push(previewUrlResponseSchema.parse(independent.body).url);
    expectPrivateLogs(storage, urls.flatMap(secretsOf));
  });

  it.each(['preview', 'download'] as const)(
    'CA-12: agotar %s no consume el contador del otro flujo',
    async (flow) => {
      const client = await storage.newClient();
      const file = await uploaded(client);
      const exhausted = flow === 'preview' ? client.previewUrl : client.downloadUrl;
      const independent = flow === 'preview' ? client.downloadUrl : client.previewUrl;
      for (let count = 0; count < LIMIT; count += 1)
        expect((await exhausted(file.id)).status).toBe(200);
      expectLimited(await exhausted(file.id));
      for (let count = 0; count < LIMIT; count += 1)
        expect((await independent(file.id)).status).toBe(200);
      expectLimited(await independent(file.id));
    },
  );

  it('CA-10, CA-12: 429 correlacionado registra solo preview.rate_limited, sin secretos ni fallo duplicado', async () => {
    const client = await storage.newClient();
    for (let count = 0; count < LIMIT; count += 1)
      expect((await client.previewUrl(randomUUID())).status).toBe(404);
    storage.testApp.logs.clear();
    const fileId = randomUUID();
    const token = tokens.forRole(Role.CLIENT, client.id);
    const response = await request(storage.testApp.app.getHttpServer())
      .post(`/api/v1/files/${fileId}/preview-url`)
      .auth(token, { type: 'bearer' })
      .set('Cookie', COOKIE_SECRET)
      .set('x-correlation-id', 'preview-real-429');
    expectLimited(response);
    const lines = storage.testApp.logs.withCorrelationId('preview-real-429');
    const previewEvents = lines.filter((line) => String(line.event).startsWith('preview.'));
    expect(previewEvents.length).toBe(1);
    expect(
      hasLog(previewEvents, {
        event: 'preview.rate_limited',
        fileId,
        code: 'STORAGE_TOO_MANY_REQUESTS',
      }),
    ).toBe(true);
    for (const line of lines) expect(line.correlationId).toBe('preview-real-429');
    expect(
      hasLog(lines, { event: 'http.domain_error', code: 'STORAGE_TOO_MANY_REQUESTS', status: 429 }),
    ).toBe(true);
    expectPrivateLogs(storage, [token]);
  });
});
