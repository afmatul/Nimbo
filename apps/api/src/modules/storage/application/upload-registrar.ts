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
 * Resultado del registro: el archivo creado; `race_lost` si el CAS perdió contra `cancel`/`expire`/otro `complete`
 * (no se escribió nada); `destination_gone` si la carpeta destino ya no está viva y la carga quedó `cancelada`
 * (006 CA-6: quien llama borra lo subido y responde 404).
 */
export type Registration =
  | { readonly outcome: 'registered'; readonly file: File }
  | { readonly outcome: 'race_lost' }
  | { readonly outcome: 'destination_gone' };

const RACE_LOST: Registration = { outcome: 'race_lost' };

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
   * `lockUsage` → carpeta destino viva → CAS `activa → completada` → nombre definitivo con `FileName.firstFree` en
   * esa carpeta → `INSERT archivo` y `version_archivo` (origen `carga`) → `espacio_usado += tamaño real` (la reserva
   * deja de contar al cerrar la carga, así que no se suma dos veces). Como eliminar una carpeta toma el mismo
   * `lockUsage`, la carga no se registra en una carpeta que se está eliminando (006 CA-6).
   */
  register(actor: Actor, session: UploadSession, verified: VerifiedUpload): Promise<Registration> {
    const now = this.clock.now();
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      if (!(await this.destinationAlive(actor, session))) return this.cancel(actor, session, now);
      const closed = await this.sessions.transition(actor, session.id, 'activa', 'completada', {
        at: now,
        rejectionReason: null,
      });
      if (!closed) return RACE_LOST;
      const name = session.name.firstFree(
        await this.nodes.findTakenNames(actor, session.name, session.folderId),
      );
      const file = File.create({
        id: session.fileId,
        ownerId: actor.id,
        folderId: session.folderId,
        name,
        kind: verified.kind,
        sizeBytes: verified.sizeBytes,
        currentVersionId: session.versionId,
        now,
      });
      await this.nodes.insertWithVersion(actor, file, versionOf(actor, session, verified, now));
      await this.quotas.addUsedBytes(actor, verified.sizeBytes);
      return { outcome: 'registered', file };
    });
  }

  /** `true` si la carga va a la raíz o su carpeta sigue viva y accesible. */
  private async destinationAlive(actor: Actor, session: UploadSession): Promise<boolean> {
    if (session.folderId === null) return true;
    return (await this.nodes.findAccessibleFolder(actor, session.folderId)) !== null;
  }

  /** CAS `activa → cancelada`: libera la reserva. Si pierde, otra petición cerró la carga. */
  private async cancel(actor: Actor, session: UploadSession, now: Date): Promise<Registration> {
    const cancelled = await this.sessions.transition(actor, session.id, 'activa', 'cancelada', {
      at: now,
      rejectionReason: null,
    });
    return cancelled ? { outcome: 'destination_gone' } : RACE_LOST;
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
