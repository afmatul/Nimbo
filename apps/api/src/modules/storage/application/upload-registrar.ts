import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';
import { FileVersion } from '../domain/file-version';
import type { UploadSession } from '../domain/upload-session';

import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_UPLOAD_SESSION_REPOSITORY } from './ports/i-upload-session.repository.port';
import type { IUploadSessionRepository } from './ports/i-upload-session.repository.port';

/** Lo verificado de una carga que se va a registrar: su tamaño real y su tipo detectado. */
export interface VerifiedUpload {
  readonly sizeBytes: bigint;
  readonly kind: FileKind;
}

/**
 * Paso final de `complete` (plan §6, paso 5): convierte una carga activa en `archivo` + `version_archivo` en una sola
 * transacción con actor. El `FOR UPDATE` de `lockUsage` serializa por propietario el CAS y el cálculo del «(n)»
 * (D-4); no hay `pg_advisory_xact_lock`.
 */
@Injectable()
export class UploadRegistrar {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_UPLOAD_SESSION_REPOSITORY) private readonly sessions: IUploadSessionRepository,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /**
   * `lockUsage` → CAS `activa → completada` → nombre definitivo con `FileName.firstFree` → `INSERT archivo` y
   * `version_archivo` (origen `carga`) → `espacio_usado += tamaño real` (la reserva deja de contar al cerrar la
   * carga, así que no se suma dos veces). Devuelve `null` si el CAS pierde contra `cancel`/`expire`: la transacción
   * no escribió nada y no hay archivo.
   */
  register(actor: Actor, session: UploadSession, verified: VerifiedUpload): Promise<File | null> {
    const now = this.clock.now();
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const closed = await this.sessions.transition(actor, session.id, 'activa', 'completada', {
        at: now,
        rejectionReason: null,
      });
      if (!closed) return null;
      const name = session.name.firstFree(await this.nodes.findTakenNames(actor, session.name));
      const file = File.create({
        id: session.fileId,
        ownerId: actor.id,
        name,
        kind: verified.kind,
        sizeBytes: verified.sizeBytes,
        currentVersionId: session.versionId,
        now,
      });
      await this.nodes.insertWithVersion(actor, file, versionOf(actor, session, verified, now));
      await this.quotas.addUsedBytes(actor, verified.sizeBytes);
      return file;
    });
  }
}

function versionOf(
  actor: Actor,
  session: UploadSession,
  verified: VerifiedUpload,
  now: Date,
): FileVersion {
  return FileVersion.fromUpload({
    id: session.versionId,
    fileId: session.fileId,
    objectKey: session.objectKey,
    sizeBytes: verified.sizeBytes,
    createdBy: actor.id,
    now,
  });
}
