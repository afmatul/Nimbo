import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';
import { FileVersion } from '../domain/file-version';
import type { UploadSession } from '../domain/upload-session';

import { FileVersionService } from './file-version.service';
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
 * Resultado del registro: el archivo creado o reemplazado con la versión registrada; `race_lost` si el CAS perdió
 * contra `cancel`/`expire`/otro `complete` (no se escribió nada); `destination_gone` si la carpeta destino (o, en un
 * reemplazo, el archivo) ya no está viva y la carga quedó `cancelada` (006 CA-6, 014 CA-1: quien llama borra lo
 * subido y responde 404).
 */
export type Registration =
  | { readonly outcome: 'registered'; readonly file: File; readonly version: FileVersion }
  | { readonly outcome: 'race_lost' }
  | { readonly outcome: 'destination_gone' };

const RACE_LOST: Registration = { outcome: 'race_lost' };

/** Número de la versión y momento del registro. */
interface VersionStamp {
  readonly number: number;
  readonly now: Date;
}

/**
 * Paso final de `complete` (plan §6, paso 5): convierte una carga activa en `archivo` + `version_archivo`, o en una
 * versión nueva del archivo que reemplaza (014), en una sola transacción con actor. El `FOR UPDATE` de `lockUsage`
 * serializa por propietario el CAS, el cálculo del «(n)» (D-4) y la numeración de versiones (014 CA-4).
 */
@Injectable()
export class UploadRegistrar {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_UPLOAD_SESSION_REPOSITORY) private readonly sessions: IUploadSessionRepository,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(FileVersionService) private readonly fileVersions: FileVersionService,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** Registra en su transacción y, si fue un reemplazo, poda tras el commit (014 CA-13; nunca lanza). */
  async register(
    actor: Actor,
    session: UploadSession,
    verified: VerifiedUpload,
  ): Promise<Registration> {
    const registration = await this.transactions.withActor(actor, () =>
      session.replacesFile
        ? this.registerReplacement(actor, session, verified)
        : this.registerNewFile(actor, session, verified),
    );
    if (registration.outcome === 'registered' && session.replacesFile) {
      await this.fileVersions.afterCommit(actor, registration.file.id);
    }
    return registration;
  }

  /**
   * `lockUsage` → carpeta destino viva → CAS `activa → completada` → nombre definitivo con `FileName.firstFree` en
   * esa carpeta → `INSERT archivo` y `version_archivo` (origen `carga`) → `espacio_usado += tamaño real` (la reserva
   * deja de contar al cerrar la carga, así que no se suma dos veces). Como eliminar una carpeta toma el mismo
   * `lockUsage`, la carga no se registra en una carpeta que se está eliminando (006 CA-6).
   */
  private async registerNewFile(
    actor: Actor,
    session: UploadSession,
    verified: VerifiedUpload,
  ): Promise<Registration> {
    const now = this.clock.now();
    await this.quotas.lockUsage(actor);
    if (!(await this.destinationAlive(actor, session))) return this.cancel(actor, session, now);
    if (!(await this.closeSession(actor, session, now))) return RACE_LOST;
    const name = session.name.firstFree(
      await this.nodes.findTakenNames(actor, session.name, session.folderId),
    );
    const version = uploadedVersion(session, verified, { number: 1, now });
    const file = File.create({
      id: session.fileId,
      ownerId: actor.id,
      folderId: session.folderId,
      name,
      kind: verified.kind,
      sizeBytes: verified.sizeBytes,
      currentVersionId: version.id,
      now,
    });
    await this.nodes.insertWithVersion(actor, file, version);
    await this.quotas.addUsedBytes(actor, verified.sizeBytes);
    return { outcome: 'registered', file, version };
  }

  /**
   * 014 CA-1: `lockUsage` → el archivo sigue vivo y accesible (si no, `destination_gone`) → CAS → `register` de
   * `FileVersionService` (numera, mueve el puntero y suma el espacio). El nombre y la carpeta del archivo no cambian.
   */
  private async registerReplacement(
    actor: Actor,
    session: UploadSession,
    verified: VerifiedUpload,
  ): Promise<Registration> {
    const now = this.clock.now();
    await this.quotas.lockUsage(actor);
    const file = await this.nodes.findAccessibleById(actor, session.fileId);
    if (file === null) return this.cancel(actor, session, now);
    if (!(await this.closeSession(actor, session, now))) return RACE_LOST;
    const registered = await this.fileVersions.register(actor, {
      file,
      buildVersion: (number) => uploadedVersion(session, verified, { number, now }),
    });
    return { outcome: 'registered', ...registered };
  }

  /** `true` si la carga va a la raíz o su carpeta sigue viva y accesible. */
  private async destinationAlive(actor: Actor, session: UploadSession): Promise<boolean> {
    if (session.folderId === null) return true;
    return (await this.nodes.findAccessibleFolder(actor, session.folderId)) !== null;
  }

  /** CAS `activa → completada`; `false` si otra petición ya la cerró. */
  private closeSession(actor: Actor, session: UploadSession, now: Date): Promise<boolean> {
    return this.sessions.transition(actor, session.id, 'activa', 'completada', {
      at: now,
      rejectionReason: null,
    });
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

/** La versión de origen `carga` con el objeto de la sesión; su autor es el dueño de la carga (el actor). */
function uploadedVersion(
  session: UploadSession,
  verified: VerifiedUpload,
  stamp: VersionStamp,
): FileVersion {
  return FileVersion.fromUpload({
    id: session.versionId,
    fileId: session.fileId,
    objectKey: session.objectKey,
    sizeBytes: verified.sizeBytes,
    createdBy: session.ownerId,
    ...stamp,
  });
}
