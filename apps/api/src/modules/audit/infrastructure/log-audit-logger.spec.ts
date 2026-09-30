import { CorrelationContext, createActor, FixedClock, Role } from '../../../shared';
import { AuditAction, isAuditAction } from '../application/audit-action';
import type { AuditRecord } from '../application/i-audit-logger.port';

import { LogAuditLogger } from './log-audit-logger';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const ACTOR = createActor('0b8f7c1e-1111-4a4a-9c9c-000000000001', Role.CLIENT);

const buildLogger = () => ({ info: jest.fn(), error: jest.fn() });

const buildSut = (logger = buildLogger()) => ({
  logger,
  auditLogger: new LogAuditLogger(new FixedClock(NOW), logger as never),
});

const uploadCompleted = (overrides: Partial<AuditRecord> = {}): AuditRecord => ({
  action: AuditAction.FILE_UPLOAD_COMPLETED,
  actor: ACTOR,
  targetUserId: ACTOR.id,
  resourceId: 'file-1',
  attributes: { sizeBytes: 1024, mode: 'simple', versioned: true },
  ...overrides,
});

describe('LogAuditLogger (IAuditLogger provisional)', () => {
  it('CA-20: el catálogo `AuditAction` de 005 es exactamente las tres acciones de carga y descarga', () => {
    expect(Object.values(AuditAction).sort()).toEqual(
      ['file.download_url_issued', 'file.upload_completed', 'file.upload_rejected'].sort(),
    );
  });

  it('CA-20: `isAuditAction` acepta el catálogo y rechaza cualquier otra cadena o tipo', () => {
    expect(isAuditAction('file.upload_rejected')).toBe(true);
    expect(isAuditAction('file.deleted')).toBe(false);
    expect(isAuditAction(42)).toBe(false);
    expect(isAuditAction(undefined)).toBe(false);
  });

  it('CA-20: emite `audit.record` con `occurredAt` del reloj y `correlationId` del contexto', async () => {
    const { logger, auditLogger } = buildSut();

    await CorrelationContext.run({ correlationId: 'corr-123' }, () =>
      auditLogger.record(uploadCompleted()),
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'audit.record',
      action: 'file.upload_completed',
      actorId: ACTOR.id,
      actorRole: Role.CLIENT,
      targetUserId: ACTOR.id,
      resourceId: 'file-1',
      attributes: { sizeBytes: 1024, mode: 'simple', versioned: true },
      occurredAt: NOW.toISOString(),
      correlationId: 'corr-123',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('CA-20: el evento pasa por `redactDeep` (un `fileName` en los atributos no llega al sink)', async () => {
    const { logger, auditLogger } = buildSut();

    await auditLogger.record(
      uploadCompleted({ attributes: { fileName: 'informe secreto.docx', sizeBytes: 5 } }),
    );

    const payload = logger.info.mock.calls[0][0] as { attributes: Record<string, unknown> };
    expect(payload.attributes).toEqual({ fileName: '[REDACTED]', sizeBytes: 5 });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('informe secreto');
  });

  it('CA-20: una acción fuera del catálogo no lanza, no registra el evento y anota el error', async () => {
    const { logger, auditLogger } = buildSut();

    await expect(
      auditLogger.record(uploadCompleted({ action: 'file.deleted' as AuditAction })),
    ).resolves.toBeUndefined();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith({
      event: 'audit.record_failed',
      reason: 'unknown_action',
    });
  });

  it('CA-20: si el sink lanza, `record` resuelve igual y anota `sink_error` (mejor esfuerzo)', async () => {
    const logger = buildLogger();
    logger.info.mockImplementation(() => {
      throw new Error('sink caído');
    });
    const { auditLogger } = buildSut(logger);

    await expect(auditLogger.record(uploadCompleted())).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith({
      event: 'audit.record_failed',
      action: 'file.upload_completed',
      reason: 'sink_error',
    });
  });

  it('CA-20: sin contexto de correlación no inventa `correlationId`; omite los opcionales ausentes', async () => {
    const { logger, auditLogger } = buildSut();

    await auditLogger.record({
      action: AuditAction.FILE_DOWNLOAD_URL_ISSUED,
      actor: ACTOR,
      targetUserId: ACTOR.id,
    });

    const payload = logger.info.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('correlationId');
    expect(payload).not.toHaveProperty('resourceId');
    expect(payload).not.toHaveProperty('attributes');
    expect(payload.action).toBe('file.download_url_issued');
  });
});
