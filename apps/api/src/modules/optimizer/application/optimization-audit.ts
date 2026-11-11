import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import type { OptimizationJob } from '../domain/optimization-job';

const attributesOf = (job: OptimizationJob): NonNullable<AuditRecord['attributes']> => {
  const data = job.snapshot();
  return {
    optimizationId: data.id,
    sourceVersionId: data.sourceVersionId,
    originalBytes: Number(data.originalBytes),
    ...(data.resultBytes === null ? {} : { resultBytes: Number(data.resultBytes) }),
    ...(data.state === 'completada'
      ? { versionId: data.resultVersionId ?? '' }
      : { reason: data.reason ?? '' }),
  };
};

/** Solo el ganador del CAS llama, después del commit. Estimar no cambia archivos y no se audita (plan 021 §5). */
export async function auditOptimizationOutcome(
  audit: IAuditLogger,
  actor: Actor,
  job: OptimizationJob,
): Promise<void> {
  const data = job.snapshot();
  if (data.resultVersionId === null) return;
  if (!['completada', 'descartada', 'fallida'].includes(data.state)) return;
  const action =
    data.state === 'completada'
      ? AuditAction.FILE_OPTIMIZED
      : data.state === 'descartada'
        ? AuditAction.FILE_OPTIMIZATION_DISCARDED
        : AuditAction.FILE_OPTIMIZATION_FAILED;
  await audit.record({
    action,
    actor,
    targetUserId: actor.id,
    resourceId: data.fileId,
    attributes: attributesOf(job),
  });
}
