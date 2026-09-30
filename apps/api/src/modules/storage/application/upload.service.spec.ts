import type { InitUploadInput } from '@nimbo/contracts';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
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
import {
  EmptyFileError,
  FileTooLargeError,
  InvalidUploadRequestError,
  NameConflictError,
  QuotaExceededError,
  StorageTooManyRequestsError,
} from '../domain/errors';

import type { PlanLimits } from './plan-limits';
import { QuotaService } from './quota.service';
import type { UploadConfig } from './upload-config';
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
  const quotas = new FakeQuotaRepository(journal);
  const sessions = new FakeUploadSessionRepository(journal);
  const nodes = new FakeNodeRepository(journal);
  const storage = new FakeObjectStorage(journal);
  const detector = new FakeFileTypeDetector(journal);
  const plans = new JournaledPlanLimits(journal);
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
    CONFIG,
    logger,
  );
  return {
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
    const { service, rateLimiter, journal } = setup();
    rateLimiter.decision = { allowed: false, retryAfterSeconds: 17 };

    const attempt = service.init(ACTOR, request());

    await expect(attempt).rejects.toBeInstanceOf(StorageTooManyRequestsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 17 });
    expect(rateLimiter.calls[0]).toEqual({
      key: `storage:upload-init:${ACTOR.id}`,
      rules: [{ limit: 300, windowSeconds: 60 }],
    });
    expect(journal.entries).toEqual(['rate:consume']);
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
