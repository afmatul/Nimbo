import { CorrelationContext, createActor, FixedClock, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { SYSTEM_ACTOR } from '../domain/audit-actor';
import type { AuditActor } from '../domain/audit-actor';
import type { AuditEntry } from '../domain/audit-entry';

import { AuditAction } from './audit-action';
import { AuditService } from './audit.service';
import type { AuditRecord } from './i-audit-logger.port';
import type { IAuditRepository } from './ports/i-audit.repository.port';
import { UnknownAuditActionError } from './unknown-audit-action.error';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const ANA = createActor('0b8f7c1e-1111-4a4a-9c9c-000000000001', Role.CLIENT);
const SUPPORT = createActor('0b8f7c1e-2222-4a4a-9c9c-000000000002', Role.SUPPORT);
const FILE_ID = '0b8f7c1e-3333-4a4a-9c9c-000000000003';
const FILE_NAME = 'informe secreto.docx';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Ejecutor que corre `work` sin base y recuerda con qué actor se abrió cada transacción y cuántos `run` hubo. */
const fakeTransactions = () => {
  const actors: Actor[] = [];
  const runs = { count: 0 };
  const runner: ITransactionRunner = {
    run: (work) => {
      runs.count += 1;
      return work();
    },
    withActor: (actor, work) => {
      actors.push(actor);
      return work();
    },
  };
  return { runner, actors, runs };
};

const buildSut = () => {
  const inserted: { actor: AuditActor; entry: AuditEntry }[] = [];
  const repository: jest.Mocked<IAuditRepository> = {
    insert: jest.fn((actor: AuditActor, entry: AuditEntry) => {
      inserted.push({ actor, entry });
      return Promise.resolve();
    }),
    listForTarget: jest.fn(),
  };
  const transactions = fakeTransactions();
  const logger = { info: jest.fn(), error: jest.fn() };
  const service = new AuditService(
    repository,
    transactions.runner,
    new FixedClock(NOW),
    logger as never,
  );
  return { service, repository, inserted, transactions, logger };
};

const uploadCompleted = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  action: AuditAction.FILE_UPLOAD_COMPLETED,
  actor: ANA,
  targetUserId: ANA.id,
  resourceId: FILE_ID,
  attributes: { sizeBytes: 1024, mode: 'simple' },
  ...overrides,
});

const failedLines = (logger: { error: jest.Mock }) =>
  logger.error.mock.calls
    .map(([payload]) => payload as Record<string, unknown>)
    .filter((payload) => payload.event === 'audit.record_failed');

describe('AuditService.record (mejor esfuerzo)', () => {
  it('CA-1: guarda el evento con reloj, `correlationId`, tipo de recurso y el actor dentro de `withActor`', async () => {
    const { service, inserted, transactions } = buildSut();

    await CorrelationContext.run({ correlationId: 'corr-123' }, () =>
      service.record(uploadCompleted()),
    );

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.actor).toBe(ANA);
    expect(inserted[0]?.entry).toEqual({
      id: expect.stringMatching(UUID_PATTERN) as string,
      action: 'file.upload_completed',
      actorId: ANA.id,
      actorRole: Role.CLIENT,
      targetUserId: ANA.id,
      resourceType: 'file',
      resourceId: FILE_ID,
      attributes: { sizeBytes: 1024, mode: 'simple' },
      occurredAt: NOW,
      correlationId: 'corr-123',
    });
    expect(transactions.actors).toEqual([ANA]);
  });

  it('CA-2: tras guardar deja la línea `audit.record` con los mismos datos que el adaptador de 005', async () => {
    const { service, logger } = buildSut();

    await service.record(uploadCompleted());

    expect(logger.info).toHaveBeenCalledWith({
      event: 'audit.record',
      action: 'file.upload_completed',
      actorId: ANA.id,
      actorRole: Role.CLIENT,
      targetUserId: ANA.id,
      resourceId: FILE_ID,
      attributes: { sizeBytes: 1024, mode: 'simple' },
      occurredAt: NOW.toISOString(),
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('011b RN-4: el motivo de Soporte se guarda, pero la línea `audit.record` solo lleva su clave', async () => {
    const { service, inserted, logger } = buildSut();
    const note = 'El cliente pidió recuperar el informe';

    await service.record({
      action: AuditAction.NODE_RESTORED,
      actor: SUPPORT,
      targetUserId: ANA.id,
      resourceId: FILE_ID,
      attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 1024, note },
    });

    expect(inserted[0]?.entry.attributes).toMatchObject({ note });
    const line = logger.info.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(line).toMatchObject({
      attributes: { nodeType: 'file', itemCount: 1, sizeBytes: 1024 },
      omittedKeys: ['note'],
    });
    expect(JSON.stringify(line)).not.toContain(note);
  });

  it('CA-1: sin contexto de correlación ni recurso, guarda `null` en ambos', async () => {
    const { service, inserted, logger } = buildSut();

    await service.record({
      action: AuditAction.TRASH_EMPTIED,
      actor: ANA,
      targetUserId: ANA.id,
      attributes: { itemCount: 2, sizeBytes: 4000 },
    });

    expect(inserted[0]?.entry).toMatchObject({
      resourceType: null,
      resourceId: null,
      correlationId: null,
    });
    expect(logger.info.mock.calls[0]?.[0]).not.toHaveProperty('resourceId');
  });

  it('CA-1: sin un tipo de recurso derivable, el recurso queda vacío (tipo e id van juntos)', async () => {
    const { service, inserted } = buildSut();

    await service.record({
      action: AuditAction.NODE_TRASHED,
      actor: ANA,
      targetUserId: ANA.id,
      resourceId: FILE_ID,
      attributes: { itemCount: 1 },
    });

    expect(inserted[0]?.entry).toMatchObject({ resourceType: null, resourceId: null });
  });

  it('CA-3: una acción fuera del catálogo no lanza, no guarda y anota `unknown_action` sin repetirla', async () => {
    const { service, repository, logger } = buildSut();

    await expect(
      service.record(uploadCompleted({ action: 'file.deleted' as AuditAction })),
    ).resolves.toBeUndefined();

    expect(repository.insert).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(failedLines(logger)).toEqual([
      { event: 'audit.record_failed', reason: 'unknown_action' },
    ]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('file.deleted');
  });

  it('CA-4: guarda sin la clave prohibida ni el valor no plano y anota cada motivo con las claves, nunca el valor', async () => {
    const { service, inserted, logger } = buildSut();

    await service.record(
      uploadCompleted({
        attributes: {
          sizeBytes: 5,
          fileName: FILE_NAME,
          url: 'https://minio/firmada',
          nested: { a: 1 } as never,
        },
      }),
    );

    expect(inserted[0]?.entry.attributes).toEqual({ sizeBytes: 5 });
    expect(failedLines(logger)).toEqual([
      {
        event: 'audit.record_failed',
        action: 'file.upload_completed',
        reason: 'attribute_not_allowed',
        keys: ['fileName', 'url', 'nested'],
      },
    ]);
    const dump = JSON.stringify([logger.error.mock.calls, logger.info.mock.calls]);
    expect(dump).not.toContain(FILE_NAME);
    expect(dump).not.toContain('minio/firmada');
  });

  it('CA-4: un valor no plano y un texto largo se descartan, una línea por motivo', async () => {
    const { service, inserted, logger } = buildSut();

    await service.record(
      uploadCompleted({ attributes: { sizeBytes: { a: 1 } as never, mode: 'x'.repeat(501) } }),
    );

    expect(inserted[0]?.entry.attributes).toEqual({});
    expect(failedLines(logger)).toEqual([
      expect.objectContaining({ reason: 'attribute_not_flat', keys: ['sizeBytes'] }),
      expect.objectContaining({ reason: 'attribute_too_long', keys: ['mode'] }),
    ]);
  });

  it('CA-5: si la base falla, `record` resuelve igual, no deja `audit.record` y anota el nombre del error', async () => {
    const { service, repository, logger } = buildSut();
    repository.insert.mockRejectedValueOnce(new TypeError(`no conecta: ${FILE_NAME}`));

    await expect(service.record(uploadCompleted())).resolves.toBeUndefined();

    expect(logger.info).not.toHaveBeenCalled();
    expect(failedLines(logger)).toEqual([
      {
        event: 'audit.record_failed',
        action: 'file.upload_completed',
        reason: 'write_failed',
        errorName: 'TypeError',
      },
    ]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(FILE_NAME);
  });
});

describe('AuditService.recordInTransaction (síncrona)', () => {
  it('CA-5: guarda el evento en la transacción del mismo actor, también si es un rol interno sobre otra cuenta', async () => {
    const { service, inserted, transactions } = buildSut();

    await service.recordInTransaction(uploadCompleted({ actor: SUPPORT }));

    expect(transactions.actors).toEqual([SUPPORT]);
    expect(inserted[0]?.entry).toMatchObject({
      actorId: SUPPORT.id,
      actorRole: Role.SUPPORT,
      targetUserId: ANA.id,
    });
  });

  it('CA-3: una acción fuera del catálogo lanza `UnknownAuditActionError` y no guarda', async () => {
    const { service, repository } = buildSut();

    await expect(
      service.recordInTransaction(uploadCompleted({ action: 'file.deleted' as AuditAction })),
    ).rejects.toBeInstanceOf(UnknownAuditActionError);

    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('CA-5: si la base falla, deja pasar el error para que el llamador revierta', async () => {
    const { service, repository, logger } = buildSut();
    const failure = new Error('base caída');
    repository.insert.mockRejectedValueOnce(failure);

    await expect(service.recordInTransaction(uploadCompleted())).rejects.toBe(failure);

    expect(failedLines(logger)).toEqual([]);
  });

  it('CA-4: descarta los atributos prohibidos y los anota igual que `record`', async () => {
    const { service, inserted, logger } = buildSut();

    await service.recordInTransaction(
      uploadCompleted({ attributes: { sizeBytes: 5, fileName: FILE_NAME } }),
    );

    expect(inserted[0]?.entry.attributes).toEqual({ sizeBytes: 5 });
    expect(failedLines(logger)).toEqual([
      expect.objectContaining({ reason: 'attribute_not_allowed', keys: ['fileName'] }),
    ]);
  });

  it('D-5: no deja la línea `audit.record` (la transacción del llamador aún puede revertirse)', async () => {
    const { service, logger } = buildSut();

    await service.recordInTransaction(uploadCompleted());

    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('AuditService con el actor de sistema (011 CA-7)', () => {
  const ADMIN_ID = '0b8f7c1e-5555-4a4a-9c9c-000000000005';
  const bootstrap = (): AuditRecord => ({
    action: AuditAction.ACCOUNT_BOOTSTRAP_ADMIN,
    actor: SYSTEM_ACTOR,
    targetUserId: null,
    resourceId: ADMIN_ID,
  });

  it('CA-7: `recordInTransaction` escribe con `run` (se une al del llamador), nunca con `withActor`', async () => {
    const { service, inserted, transactions } = buildSut();

    await service.recordInTransaction(bootstrap());

    expect(transactions.runs.count).toBe(1);
    expect(transactions.actors).toEqual([]);
    expect(inserted[0]?.actor).toBe(SYSTEM_ACTOR);
  });

  it('CA-7: el evento no tiene actor ni afectado, su rol es `SYSTEM` y su recurso es la cuenta creada', async () => {
    const { service, inserted } = buildSut();

    await service.recordInTransaction(bootstrap());

    expect(inserted[0]?.entry).toMatchObject({
      action: 'account.bootstrap_admin',
      actorId: null,
      actorRole: 'SYSTEM',
      targetUserId: null,
      resourceType: 'account',
      resourceId: ADMIN_ID,
    });
  });

  it('CA-7: con un actor de persona sigue usando `withActor` y no `run`', async () => {
    const { service, transactions } = buildSut();

    await service.recordInTransaction(uploadCompleted({ actor: SUPPORT }));

    expect(transactions.runs.count).toBe(0);
    expect(transactions.actors).toEqual([SUPPORT]);
  });
});

describe('AuditService.listForUser', () => {
  it('CA-12: lee dentro de `withActor` del propio actor y le pasa la consulta al repositorio', async () => {
    const { service, repository, transactions } = buildSut();
    const page = { entries: [], nextCursor: null };
    repository.listForTarget.mockResolvedValue(page);
    const query = { origin: 'staff' } as const;

    await expect(service.listForUser(SUPPORT, query)).resolves.toBe(page);

    expect(transactions.actors).toEqual([SUPPORT]);
    expect(repository.listForTarget).toHaveBeenCalledWith(SUPPORT, query);
  });
});
