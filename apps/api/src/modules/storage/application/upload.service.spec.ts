import { randomUUID as randomId } from 'node:crypto';

import type { InitUploadInput } from '@nimbo/contracts';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeFileTypeDetector,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeRateLimiter,
  FakeTransactionRunner,
  FakeUploadSessionRepository,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import {
  EmptyFileError,
  FileTooLargeError,
  InvalidFileTypeError,
  InvalidUploadRequestError,
  NameConflictError,
  QuotaExceededError,
  StorageTooManyRequestsError,
  UploadExpiredError,
  UploadIncompleteError,
  UploadNotFoundError,
  UploadSizeMismatchError,
} from '../domain/errors';
import type { UploadSession } from '../domain/upload-session';

import type { PlanLimits } from './plan-limits';
import { QuotaService } from './quota.service';
import type { UploadConfig } from './upload-config';
import { UploadRegistrar } from './upload-registrar';
import { UploadService } from './upload.service';

const MIB = 1_048_576;
const NOW = new Date('2026-09-30T10:00:00.000Z');
const IN_24_HOURS = '2026-10-01T10:00:00.000Z';
const IN_1_HOUR = '2026-09-30T11:00:00.000Z';
const ACTOR: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const LIMITS: PlanLimits = {
  maxFileBytes: 1_000n * BigInt(MIB),
  storageQuotaBytes: 2_000n * BigInt(MIB),
};
const CONFIG: UploadConfig = {
  partSizeBytes: BigInt(8 * MIB),
  multipartThresholdBytes: BigInt(16 * MIB),
  urlTtlSeconds: 3600,
  initPerMinute: 300,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Doble de límites que anota en el diario cuándo se pidieron (debe ser fuera de la transacción). */
class JournaledPlanLimits extends FakePlanLimitsProvider {
  constructor(private readonly journal: Journal) {
    super(LIMITS);
  }

  override limitsFor(actor: Actor): Promise<PlanLimits> {
    this.journal.add('plans:limitsFor');
    return super.limitsFor(actor);
  }
}

function setup() {
  const journal = new Journal();
  const clock = new FixedClock(NOW);
  const transactions = new FakeTransactionRunner(journal);
  const rateLimiter = new FakeRateLimiter(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const sessions = new FakeUploadSessionRepository(journal);
  const nodes = new FakeNodeRepository(journal);
  const storage = new FakeObjectStorage(journal);
  const detector = new FakeFileTypeDetector(journal);
  const plans = new JournaledPlanLimits(journal);
  const audit = new FakeAuditLogger(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new UploadService(
    transactions,
    rateLimiter,
    clock,
    plans,
    new QuotaService(quotas, clock),
    sessions,
    nodes,
    storage,
    detector,
    new UploadRegistrar(transactions, quotas, sessions, nodes, clock),
    audit,
    CONFIG,
    logger,
  );
  return {
    audit,
    journal,
    clock,
    transactions,
    rateLimiter,
    quotas,
    sessions,
    nodes,
    storage,
    detector,
    plans,
    logger,
    service,
  };
}

type Setup = ReturnType<typeof setup>;

function request(overrides: Partial<InitUploadInput> = {}): InitUploadInput {
  return { name: 'informe.docx', sizeBytes: MIB, onConflict: 'ask', ...overrides };
}

function loggedPayloads(logger: Setup['logger']): string {
  return JSON.stringify([
    ...logger.info.mock.calls,
    ...logger.warn.mock.calls,
    ...logger.error.mock.calls,
  ]);
}

describe('UploadService.init', () => {
  it('CA-1: una carga pequeña es simple: una URL firmada con su tamaño y la reserva como fila `activa`', async () => {
    const { service, sessions, storage } = setup();

    const response = await service.init(ACTOR, request());

    expect(response).toEqual({
      uploadId: expect.stringMatching(UUID) as string,
      mode: 'simple',
      name: 'informe.docx',
      expiresAt: IN_24_HOURS,
      upload: {
        url: expect.stringContaining('https://') as string,
        method: 'PUT',
        expiresAt: IN_1_HOUR,
      },
    });
    const session = sessions.sessions.get(response.uploadId);
    expect(session?.state).toBe('activa');
    expect(session?.declaredBytes).toBe(BigInt(MIB));
    expect(session?.multipart).toBeNull();
    expect(storage.signedObjects).toEqual([
      { key: session?.objectKey.value, contentLength: BigInt(MIB), expiresInSeconds: 3600 },
    ]);
    expect(session?.objectKey.value.startsWith(`u/${ACTOR.id}/`)).toBe(true);
  });

  it('CA-2: por encima del umbral es por partes: todas las URLs, la última parte con el resto', async () => {
    const { service, sessions, storage } = setup();

    const response = await service.init(ACTOR, request({ sizeBytes: 20 * MIB }));

    expect(response).toMatchObject({
      mode: 'multipart',
      partSizeBytes: 8 * MIB,
      totalParts: 3,
      urlsExpireAt: IN_1_HOUR,
      expiresAt: IN_24_HOURS,
    });
    expect(response.mode === 'multipart' && response.parts.map((part) => part.partNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(storage.signedParts.map((part) => part.contentLength)).toEqual([
      BigInt(8 * MIB),
      BigInt(8 * MIB),
      BigInt(4 * MIB),
    ]);
    const session = sessions.sessions.get(response.uploadId);
    expect(session?.multipart).toEqual({
      uploadId: 'mp-1',
      totalParts: 3,
      partSizeBytes: BigInt(8 * MIB),
    });
  });

  it('CA-2: justo en el umbral la carga todavía es simple (toda carga por partes tiene al menos 2)', async () => {
    const { service, storage } = setup();

    const response = await service.init(ACTOR, request({ sizeBytes: 16 * MIB }));

    expect(response.mode).toBe('simple');
    expect(storage.multiparts.size).toBe(0);
  });

  it('CA-23: sigue el orden del plan §6: tasa, límites fuera de la transacción, cuota, nombre, multipart, fila, firmas', async () => {
    const { service, journal } = setup();

    await service.init(ACTOR, request({ sizeBytes: 20 * MIB }));

    expect(journal.entries).toEqual([
      'rate:consume',
      'plans:limitsFor',
      'tx:begin',
      'quota:lockAndReadUsage',
      'nodes:findTakenNames',
      'storage:createMultipart',
      'session:insert',
      'storage:presign',
      'storage:presign',
      'storage:presign',
      'tx:end',
    ]);
  });

  it('CA-19: con la tasa agotada responde 429 con `Retry-After` antes de tocar nada más', async () => {
    const { service, rateLimiter, journal, logger } = setup();
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 17 };

    const attempt = service.init(ACTOR, request());

    await expect(attempt).rejects.toBeInstanceOf(StorageTooManyRequestsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 17 });
    expect(rateLimiter.calls[0]).toEqual({
      key: `storage:upload-init:${ACTOR.id}`,
      rules: [{ limit: 300, windowSeconds: 60 }],
    });
    expect(journal.entries).toEqual(['rate:consume']);
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'upload.rate_limited',
      operation: 'upload_init',
    });
  });

  it('CA-7: un nombre inválido responde 400 con el campo en falla, sin pedir límites', async () => {
    const { service, journal } = setup();

    const attempt = service.init(ACTOR, request({ name: '..' }));

    await expect(attempt).rejects.toBeInstanceOf(InvalidUploadRequestError);
    await expect(attempt).rejects.toMatchObject({
      fields: [{ field: 'name', reason: 'INVALID_NAME', message: expect.any(String) as string }],
    });
    expect(journal.entries).not.toContain('plans:limitsFor');
  });

  it('CA-7: un archivo de 0 bytes responde 422 `STORAGE_EMPTY_FILE` sin abrir transacción', async () => {
    const { service, journal } = setup();

    await expect(service.init(ACTOR, request({ sizeBytes: 0 }))).rejects.toBeInstanceOf(
      EmptyFileError,
    );

    expect(journal.entries).toEqual(['rate:consume']);
  });

  it('CA-3: supera el máximo del plan: 422 sin sesión ni multipart', async () => {
    const { service, sessions, journal } = setup();

    const attempt = service.init(ACTOR, request({ sizeBytes: 1_001 * MIB }));

    await expect(attempt).rejects.toBeInstanceOf(FileTooLargeError);
    expect(sessions.sessions.size).toBe(0);
    expect(journal.entries).not.toContain('storage:createMultipart');
    expect(journal.entries).not.toContain('nodes:findTakenNames');
  });

  it('CA-4, CA-23: lo usado más lo reservado más lo declarado no cabe: 422 con lo que falta', async () => {
    const { service, quotas, sessions } = setup();
    quotas.usage = { usedBytes: BigInt(1_500 * MIB), reservedBytes: BigInt(499 * MIB) };

    const attempt = service.init(ACTOR, request({ sizeBytes: 2 * MIB }));

    await expect(attempt).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(attempt).rejects.toMatchObject({ details: { missingBytes: MIB } });
    expect(sessions.sessions.size).toBe(0);
  });

  it('CA-6: nombre repetido con `ask`: 409 con `suggestedName`, sin sesión ni multipart', async () => {
    const { service, nodes, sessions, journal } = setup();
    nodes.taken = ['Informe.docx'];

    const attempt = service.init(ACTOR, request({ sizeBytes: 20 * MIB }));

    await expect(attempt).rejects.toBeInstanceOf(NameConflictError);
    await expect(attempt).rejects.toMatchObject({ suggestedName: 'informe (1).docx' });
    expect(sessions.sessions.size).toBe(0);
    expect(journal.entries).not.toContain('storage:createMultipart');
  });

  it('CA-6: con `keep_both` no pregunta y devuelve el nombre previsto; la sesión guarda el original', async () => {
    const { service, nodes, sessions } = setup();
    nodes.taken = ['informe.docx', 'informe (1).docx'];

    const response = await service.init(ACTOR, request({ onConflict: 'keep_both' }));

    expect(response.name).toBe('informe (2).docx');
    const session = sessions.sessions.get(response.uploadId);
    expect(session?.name.value).toBe('informe.docx');
    expect(session?.keepBoth).toBe(true);
  });

  it('CA-2: si algo falla después de crear el multipart, lo aborta y relanza el error', async () => {
    const { service, storage } = setup();
    storage.failSigning = true;

    await expect(service.init(ACTOR, request({ sizeBytes: 20 * MIB }))).rejects.toThrow('firma');

    expect(storage.multiparts.size).toBe(0);
    expect(storage.aborted).toHaveLength(1);
  });

  it('CA-20: registra `upload.initiated` con id, tamaño y modo, sin nombre, URL ni clave', async () => {
    const { service, logger } = setup();

    const response = await service.init(ACTOR, request({ sizeBytes: 20 * MIB }));

    expect(logger.info).toHaveBeenCalledWith({
      event: 'upload.initiated',
      cargaId: response.uploadId,
      sizeBytes: 20 * MIB,
      mode: 'multipart',
    });
    const logged = loggedPayloads(logger);
    expect(logged).not.toContain('informe');
    expect(logged).not.toContain('https://');
    expect(logged).not.toContain(`u/${ACTOR.id}`);
  });
});

const OTHER: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);
const DAY_MS = 86_400_000;
const TEN_MINUTES_MS = 600_000;

/** Inicia una carga real con el servicio y devuelve su sesión tal como quedó guardada. */
async function started(ctx: Setup, sizeBytes = 20 * MIB): Promise<UploadSession> {
  const response = await ctx.service.init(ACTOR, request({ sizeBytes }));
  const session = ctx.sessions.sessions.get(response.uploadId);
  if (session === undefined) throw new Error('la sesión no se guardó');
  return session;
}

type ClosedState = 'completada' | 'rechazada' | 'cancelada' | 'expirada';

/** Deja la sesión en `state` como si otra petición la hubiera cerrado. */
function forceState(ctx: Setup, session: UploadSession, state: ClosedState): void {
  const now = ctx.clock.now();
  const close: Record<ClosedState, () => UploadSession> = {
    completada: () => session.complete(now),
    rechazada: () => session.reject('tamano', now),
    cancelada: () => session.cancel(now),
    expirada: () => session.expire(now),
  };
  ctx.sessions.put(close[state]());
}

describe('UploadService.resume', () => {
  it('CA-8: por partes devuelve las partes ya recibidas y URLs nuevas solo de las que faltan', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.addPart(session.objectKey.value, 'mp-1', 1, BigInt(8 * MIB));
    ctx.storage.signedParts.length = 0;
    ctx.clock.advance(TEN_MINUTES_MS);

    const response = await ctx.service.resume(ACTOR, session.id);

    expect(response).toEqual({
      uploadId: session.id,
      mode: 'multipart',
      expiresAt: IN_24_HOURS,
      completedParts: [{ partNumber: 1, sizeBytes: 8 * MIB }],
      pending: {
        partSizeBytes: 8 * MIB,
        totalParts: 3,
        parts: [
          { partNumber: 2, url: expect.any(String) as string },
          { partNumber: 3, url: expect.any(String) as string },
        ],
        urlsExpireAt: '2026-09-30T11:10:00.000Z',
      },
    });
    expect(ctx.storage.signedParts.map((part) => part.contentLength)).toEqual([
      BigInt(8 * MIB),
      BigInt(4 * MIB),
    ]);
  });

  it('CA-8: si el multipart ya se cerró, todas las partes cuentan como recibidas y no hay URLs', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.multiparts.clear();

    const response = await ctx.service.resume(ACTOR, session.id);

    expect(response.mode === 'multipart' && response.pending.parts).toEqual([]);
    expect(response.completedParts.map((part) => part.sizeBytes)).toEqual([
      8 * MIB,
      8 * MIB,
      4 * MIB,
    ]);
  });

  it('CA-8: una carga simple recibe una URL nueva (se reinicia desde cero)', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);

    const response = await ctx.service.resume(ACTOR, session.id);

    expect(response).toEqual({
      uploadId: session.id,
      mode: 'simple',
      expiresAt: IN_24_HOURS,
      completedParts: [],
      pending: { url: expect.any(String) as string, method: 'PUT', expiresAt: IN_1_HOUR },
    });
  });

  it.each(['completada', 'rechazada', 'cancelada'] as const)(
    'CA-22: una carga %s no se reanuda (404)',
    async (state) => {
      const ctx = setup();
      const session = await started(ctx);
      forceState(ctx, session, state);

      await expect(ctx.service.resume(ACTOR, session.id)).rejects.toBeInstanceOf(
        UploadNotFoundError,
      );
    },
  );

  it('CA-16: la carga de otro usuario es igual a una inexistente (404)', async () => {
    const ctx = setup();
    const session = await started(ctx);

    await expect(ctx.service.resume(OTHER, session.id)).rejects.toBeInstanceOf(UploadNotFoundError);
    await expect(ctx.service.resume(ACTOR, randomId())).rejects.toBeInstanceOf(UploadNotFoundError);
  });

  it('CA-9: a las 24 h la vence, aborta sus partes y responde 410 (también después)', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.clock.advance(DAY_MS);

    await expect(ctx.service.resume(ACTOR, session.id)).rejects.toBeInstanceOf(UploadExpiredError);

    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('expirada');
    expect(ctx.storage.aborted).toEqual([session.objectKey.value]);
    await expect(ctx.service.resume(ACTOR, session.id)).rejects.toBeInstanceOf(UploadExpiredError);
  });

  it('CA-20: registra `upload.resumed` solo con el id de la carga', async () => {
    const ctx = setup();
    const session = await started(ctx);

    await ctx.service.resume(ACTOR, session.id);

    expect(ctx.logger.info).toHaveBeenCalledWith({ event: 'upload.resumed', cargaId: session.id });
  });
});

describe('UploadService.cancel', () => {
  it('CA-22: CAS a `cancelada` primero y después aborta las partes', async () => {
    const ctx = setup();
    const session = await started(ctx);

    await ctx.service.cancel(ACTOR, session.id);

    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('cancelada');
    const cas = ctx.journal.indexOf('session:transition:cancelada');
    expect(cas).toBeGreaterThan(-1);
    expect(ctx.journal.indexOf('storage:abortMultipart')).toBeGreaterThan(cas);
    expect(ctx.storage.aborted).toEqual([session.objectKey.value]);
    expect(ctx.logger.info).toHaveBeenCalledWith({
      event: 'upload.cancelled',
      cargaId: session.id,
    });
  });

  it('CA-22: una carga simple purga su objeto (todas las versiones)', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);

    await ctx.service.cancel(ACTOR, session.id);

    expect(ctx.storage.purged).toEqual([session.objectKey.value]);
  });

  it('CA-22: cancelar dos veces: la segunda es 404', async () => {
    const ctx = setup();
    const session = await started(ctx);
    await ctx.service.cancel(ACTOR, session.id);

    await expect(ctx.service.cancel(ACTOR, session.id)).rejects.toBeInstanceOf(UploadNotFoundError);
  });

  it('CA-22: si pierde el CAS contra un `complete`, responde 404 y no borra nada', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.sessions.raceTo = 'completada';

    await expect(ctx.service.cancel(ACTOR, session.id)).rejects.toBeInstanceOf(UploadNotFoundError);

    expect(ctx.storage.aborted).toEqual([]);
    expect(ctx.storage.purged).toEqual([]);
  });

  it('CA-16: no cancela la carga de otro usuario', async () => {
    const ctx = setup();
    const session = await started(ctx);

    await expect(ctx.service.cancel(OTHER, session.id)).rejects.toBeInstanceOf(UploadNotFoundError);
    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('activa');
  });

  it('CA-22: reintenta el borrado hasta 3 veces', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.deleteFailures = 2;

    await ctx.service.cancel(ACTOR, session.id);

    expect(ctx.storage.purged).toEqual([session.objectKey.value]);
  });

  it('CA-22: si el borrado falla 3 veces, la carga queda cancelada y se registra el error', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.deleteFailures = 3;

    await expect(ctx.service.cancel(ACTOR, session.id)).resolves.toBeUndefined();

    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('cancelada');
    expect(ctx.logger.error).toHaveBeenCalledWith({
      event: 'upload.discard_failed',
      cargaId: session.id,
    });
  });
});

describe('UploadService.expire', () => {
  it('CA-9: vence una carga activa pasada de 24 h: CAS primero, borrar después', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.clock.advance(DAY_MS);

    await ctx.service.expire(ACTOR, session.id);

    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('expirada');
    expect(ctx.journal.indexOf('storage:abortMultipart')).toBeGreaterThan(
      ctx.journal.indexOf('session:transition:expirada'),
    );
    expect(ctx.logger.info).toHaveBeenCalledWith({ event: 'upload.expired', cargaId: session.id });
  });

  it('CA-9: no vence una carga que todavía está vigente', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.clock.advance(DAY_MS - 1);

    await ctx.service.expire(ACTOR, session.id);

    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('activa');
    expect(ctx.storage.aborted).toEqual([]);
  });

  it('CA-9: es idempotente: una carga ya cerrada o ajena no cambia', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.clock.advance(DAY_MS);
    await ctx.service.expire(ACTOR, session.id);

    await ctx.service.expire(ACTOR, session.id);
    await ctx.service.expire(OTHER, session.id);

    expect(ctx.storage.aborted).toHaveLength(1);
  });
});

/** Sube las tres partes de una carga de 20 MiB con sus tamaños correctos. */
function uploadAllParts(ctx: Setup, session: UploadSession): void {
  const key = session.objectKey.value;
  ctx.storage.addPart(key, 'mp-1', 1, BigInt(8 * MIB));
  ctx.storage.addPart(key, 'mp-1', 2, BigInt(8 * MIB));
  ctx.storage.addPart(key, 'mp-1', 3, BigInt(4 * MIB));
}

function stateOf(ctx: Setup, session: UploadSession) {
  const current = ctx.sessions.sessions.get(session.id);
  return { state: current?.state, reason: current?.rejectionReason };
}

describe('UploadService.complete', () => {
  it('CA-12: por partes: lista las partes él mismo, completa, valida el tipo y devuelve el archivo', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);

    const response = await ctx.service.complete(ACTOR, session.id);

    expect(response).toEqual({
      file: {
        id: session.fileId,
        name: 'informe.docx',
        sizeBytes: 20 * MIB,
        kind: 'docx',
        createdAt: NOW.toISOString(),
      },
    });
    expect(ctx.storage.completed[0]?.parts.map((part) => part.etag)).toEqual([
      'etag-1',
      'etag-2',
      'etag-3',
    ]);
    expect(ctx.detector.calls).toEqual([{ extension: 'docx', size: 20 * MIB }]);
    expect(stateOf(ctx, session).state).toBe('completada');
    expect(ctx.nodes.inserted[0]?.version.objectKey.value).toBe(session.objectKey.value);
    expect(ctx.logger.info).toHaveBeenCalledWith({
      event: 'upload.completed',
      fileId: session.fileId,
      sizeBytes: 20 * MIB,
    });
  });

  it('CA-12: simple: mide el objeto y guarda el tipo detectado («otros» sin firma)', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(MIB));
    ctx.detector.result = { ok: true, kind: 'otro', mime: 'application/octet-stream' };

    const response = await ctx.service.complete(ACTOR, session.id);

    expect(response.file).toMatchObject({ sizeBytes: MIB, kind: 'otro' });
    expect(ctx.storage.completed).toEqual([]);
  });

  it('CA-12: repetir `complete` tras completar devuelve el mismo archivo (idempotente)', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);
    const first = await ctx.service.complete(ACTOR, session.id);

    const second = await ctx.service.complete(ACTOR, session.id);

    expect(second).toEqual(first);
    expect(ctx.storage.completed).toHaveLength(1);
    expect(ctx.nodes.inserted).toHaveLength(1);
  });

  it('CA-10: falta una parte: 409 y la sesión sigue activa y reanudable', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.addPart(session.objectKey.value, 'mp-1', 1, BigInt(8 * MIB));

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadIncompleteError,
    );

    expect(stateOf(ctx, session).state).toBe('activa');
    expect(ctx.storage.aborted).toEqual([]);
    await expect(ctx.service.resume(ACTOR, session.id)).resolves.toMatchObject({
      mode: 'multipart',
    });
  });

  it('CA-5: una parte intermedia de otro tamaño: aborta, `rechazada(tamano)` y 422', async () => {
    const ctx = setup();
    const session = await started(ctx);
    const key = session.objectKey.value;
    ctx.storage.addPart(key, 'mp-1', 1, BigInt(8 * MIB));
    ctx.storage.addPart(key, 'mp-1', 2, BigInt(8 * MIB + 1));
    ctx.storage.addPart(key, 'mp-1', 3, BigInt(4 * MIB));

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadSizeMismatchError,
    );

    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tamano' });
    expect(ctx.storage.aborted).toEqual([key]);
    expect(ctx.storage.completed).toEqual([]);
    expect(ctx.nodes.inserted).toEqual([]);
    expect(ctx.logger.info).toHaveBeenCalledWith({
      event: 'upload.rejected',
      cargaId: session.id,
      reason: 'tamano',
    });
  });

  it('CA-5: si el plan bajó y los bytes reales superan el máximo: 422 `STORAGE_FILE_TOO_LARGE`', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);
    ctx.plans.setLimits({ ...LIMITS, maxFileBytes: BigInt(10 * MIB) });

    const attempt = ctx.service.complete(ACTOR, session.id);

    await expect(attempt).rejects.toBeInstanceOf(FileTooLargeError);
    await expect(attempt).rejects.toMatchObject({
      details: { sizeBytes: 20 * MIB, maxBytes: 10 * MIB },
    });
    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tamano' });
    expect(ctx.storage.aborted).toEqual([session.objectKey.value]);
  });

  it('CA-5: simple con más bytes que los declarados: purga el objeto y 422', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(MIB + 1));

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadSizeMismatchError,
    );

    expect(ctx.storage.purged).toEqual([session.objectKey.value]);
    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tamano' });
  });

  it('CA-7: simple de 0 bytes: `rechazada(tamano)` y 422 `STORAGE_EMPTY_FILE`', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(0));

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(EmptyFileError);

    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tamano' });
  });

  it('CA-10: simple sin objeto subido: 409 y sigue activa', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadIncompleteError,
    );

    expect(stateOf(ctx, session).state).toBe('activa');
  });

  it('CA-11: la firma no corresponde: purga, `rechazada(tipo_invalido)` y 422 con motivo y extensión', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);
    ctx.detector.result = { ok: false, reason: 'signature' };

    const attempt = ctx.service.complete(ACTOR, session.id);

    await expect(attempt).rejects.toBeInstanceOf(InvalidFileTypeError);
    await expect(attempt).rejects.toMatchObject({
      details: { reason: 'signature', extension: 'docx' },
    });
    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tipo_invalido' });
    expect(ctx.storage.purged).toEqual([session.objectKey.value]);
    expect(ctx.nodes.inserted).toEqual([]);
  });

  it('CA-24: un ejecutable se rechaza con su propio mensaje', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(MIB));
    ctx.detector.result = { ok: false, reason: 'executable' };

    const attempt = ctx.service.complete(ACTOR, session.id);

    await expect(attempt).rejects.toThrow(
      'No se permiten archivos ejecutables. Sube otro archivo.',
    );
    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tipo_invalido' });
  });

  it('CA-12: el detector lee el objeto real por rangos, no lo que dice el cliente', async () => {
    const ctx = setup();
    const session = await started(ctx, MIB);
    const content = Buffer.alloc(MIB, 7);
    ctx.storage.objects.set(session.objectKey.value, content);
    const reads: Buffer[] = [];
    ctx.detector.detect = async (reader) => {
      reads.push(await reader.read(MIB - 2, 10));
      return { ok: true, kind: 'docx', mime: 'x' };
    };

    await ctx.service.complete(ACTOR, session.id);

    expect(reads).toEqual([Buffer.from([7, 7])]);
  });

  it('CA-10: multipart ya cerrado y objeto presente: recupera sin volver a completarlo', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.multiparts.clear();
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(20 * MIB));

    const response = await ctx.service.complete(ACTOR, session.id);

    expect(response.file.sizeBytes).toBe(20 * MIB);
    expect(ctx.storage.completed).toEqual([]);
  });

  it('CA-10: multipart ya cerrado sin objeto: 409 si sigue activa', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.multiparts.clear();

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadIncompleteError,
    );
  });

  it('CA-22: multipart ya cerrado sin objeto y la carga dejó de estar activa: 404', async () => {
    const ctx = setup();
    const session = await started(ctx);
    ctx.storage.multiparts.clear();
    jest.spyOn(ctx.storage, 'headObject').mockImplementation(() => {
      forceState(ctx, session, 'cancelada');
      return Promise.resolve(null);
    });

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadNotFoundError,
    );
  });

  it('CA-9: vencida: la vence y responde 410', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);
    ctx.clock.advance(DAY_MS);

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadExpiredError,
    );

    expect(stateOf(ctx, session).state).toBe('expirada');
    expect(ctx.nodes.inserted).toEqual([]);
  });

  it('CA-22: cancelada o ajena: 404', async () => {
    const ctx = setup();
    const session = await started(ctx);
    await expect(ctx.service.complete(OTHER, session.id)).rejects.toBeInstanceOf(
      UploadNotFoundError,
    );
    await ctx.service.cancel(ACTOR, session.id);

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadNotFoundError,
    );
  });

  it('CA-22: si `cancel` gana el CAS mientras se completaba, no se registra archivo (404)', async () => {
    const ctx = setup();
    const session = await started(ctx);
    uploadAllParts(ctx, session);
    ctx.sessions.raceTo = 'cancelada';

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadNotFoundError,
    );

    expect(ctx.nodes.inserted).toEqual([]);
  });
});

/** Una carga simple ya subida entera: el objeto está en su clave y solo falta `complete`. */
async function uploadedSimple(ctx: Setup): Promise<UploadSession> {
  const response = await ctx.service.init(
    ACTOR,
    request({ sizeBytes: MIB, onConflict: 'keep_both' }),
  );
  const session = ctx.sessions.sessions.get(response.uploadId);
  if (session === undefined) throw new Error('la sesión no se guardó');
  ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(MIB));
  return session;
}

describe('UploadService.complete: registro final', () => {
  it('CA-1: en una transacción bloquea el uso, cierra la carga, nombra, inserta y suma el tamaño real', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);

    await ctx.service.complete(ACTOR, session.id);

    const entries = ctx.journal.entries;
    expect(entries.slice(entries.lastIndexOf('tx:begin'))).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'session:transition:completada',
      'nodes:findTakenNames',
      'nodes:insertWithVersion',
      'quota:addUsedBytes',
      'tx:end',
      'audit:file.upload_completed',
    ]);
    expect(ctx.quotas.added).toEqual([BigInt(MIB)]);
    expect(ctx.nodes.inserted[0]?.version.origin).toBe('carga');
  });

  it('CA-6: dos cargas del mismo nombre completadas a la vez: la segunda queda «(1)» sin 409', async () => {
    const ctx = setup();
    const first = await uploadedSimple(ctx);
    const second = await uploadedSimple(ctx);

    const [a, b] = await Promise.all([
      ctx.service.complete(ACTOR, first.id),
      ctx.service.complete(ACTOR, second.id),
    ]);

    expect([a.file.name, b.file.name].sort()).toEqual(['informe (1).docx', 'informe.docx']);
    expect(ctx.nodes.inserted).toHaveLength(2);
  });

  it('CA-6: el nombre definitivo se calcula al completar, contra lo que existe entonces', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.nodes.taken = ['Informe.docx', 'informe (1).docx'];

    const response = await ctx.service.complete(ACTOR, session.id);

    expect(response.file.name).toBe('informe (2).docx');
    await expect(ctx.service.complete(ACTOR, session.id)).resolves.toEqual(response);
  });

  it('CA-12: repetir `complete` no suma el tamaño ni audita otra vez', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    await ctx.service.complete(ACTOR, session.id);

    await ctx.service.complete(ACTOR, session.id);

    expect(ctx.quotas.added).toEqual([BigInt(MIB)]);
    expect(ctx.audit.records).toHaveLength(1);
  });

  it('CA-22: si `cancel` gana el CAS, no inserta archivo, no suma espacio ni audita (404)', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.sessions.raceTo = 'cancelada';

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadNotFoundError,
    );

    expect(ctx.nodes.inserted).toEqual([]);
    expect(ctx.quotas.added).toEqual([]);
    expect(ctx.audit.records).toEqual([]);
  });

  it('CA-9: si la limpieza la vence justo antes del CAS, responde 410 sin archivo', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.sessions.raceTo = 'expirada';

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadExpiredError,
    );

    expect(ctx.nodes.inserted).toEqual([]);
  });

  it('CA-20: audita `file.upload_completed` tras el commit, sin nombre, URL ni clave', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);

    await ctx.service.complete(ACTOR, session.id);

    expect(ctx.audit.records).toEqual([
      {
        action: AuditAction.FILE_UPLOAD_COMPLETED,
        actor: ACTOR,
        targetUserId: ACTOR.id,
        resourceId: session.fileId,
        attributes: { sizeBytes: MIB, mode: 'simple' },
      },
    ]);
    expect(JSON.stringify(ctx.audit.records)).not.toContain('informe');
  });

  it('CA-20, RN-10: si la auditoría falla, el archivo queda registrado y se anota el error', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.audit.fails = true;

    const response = await ctx.service.complete(ACTOR, session.id);

    expect(response.file.id).toBe(session.fileId);
    expect(ctx.nodes.inserted).toHaveLength(1);
    expect(ctx.logger.error).toHaveBeenCalledWith({
      event: 'audit.record_failed',
      action: AuditAction.FILE_UPLOAD_COMPLETED,
      fileId: session.fileId,
    });
  });

  it('CA-11, CA-20: un rechazo audita `file.upload_rejected` con su motivo y la carga', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.detector.result = { ok: false, reason: 'signature' };

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      InvalidFileTypeError,
    );

    expect(ctx.audit.records).toEqual([
      {
        action: AuditAction.FILE_UPLOAD_REJECTED,
        actor: ACTOR,
        targetUserId: ACTOR.id,
        resourceId: session.id,
        attributes: { reason: 'tipo_invalido', mode: 'simple' },
      },
    ]);
  });

  it('CA-5: si la auditoría del rechazo falla, el rechazo sigue igual y se anota el error', async () => {
    const ctx = setup();
    const session = await uploadedSimple(ctx);
    ctx.storage.objects.set(session.objectKey.value, Buffer.alloc(MIB + 1));
    ctx.audit.fails = true;

    await expect(ctx.service.complete(ACTOR, session.id)).rejects.toBeInstanceOf(
      UploadSizeMismatchError,
    );

    expect(stateOf(ctx, session)).toEqual({ state: 'rechazada', reason: 'tamano' });
    expect(ctx.logger.error).toHaveBeenCalledWith({
      event: 'audit.record_failed',
      action: AuditAction.FILE_UPLOAD_REJECTED,
      cargaId: session.id,
    });
  });
});
