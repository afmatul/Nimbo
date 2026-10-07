import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IUploadSessionRepository,
  UploadTransitionPatch,
} from '../../application/ports/i-upload-session.repository.port';
import { FileName } from '../../domain/file-name.vo';
import { UploadSession } from '../../domain/upload-session';
import type { MultipartUpload, UploadState } from '../../domain/upload-session';

import { CargaOrmEntity } from './carga.orm-entity';

const toMultipart = (row: CargaOrmEntity): MultipartUpload | null =>
  row.uploadId === null || row.partesTotales === null || row.tamanoParteBytes === null
    ? null
    : {
        uploadId: row.uploadId,
        totalParts: row.partesTotales,
        partSizeBytes: row.tamanoParteBytes,
      };

const toSession = (row: CargaOrmEntity): UploadSession =>
  UploadSession.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    fileId: row.archivoId,
    versionId: row.versionId,
    folderId: row.carpetaDestinoId,
    name: FileName.of(row.nombre),
    keepBoth: row.conservarAmbos,
    declaredBytes: row.tamanoBytes,
    multipart: toMultipart(row),
    state: row.estado,
    rejectionReason: row.motivoRechazo,
    expiresAt: row.expiraEn,
    createdAt: row.creadaEn,
    updatedAt: row.actualizadaEn,
    finishedAt: row.finalizadaEn,
  });

const toRow = (session: UploadSession): CargaOrmEntity => ({
  id: session.id,
  propietarioId: session.ownerId,
  nombre: session.name.value,
  carpetaDestinoId: session.folderId,
  conservarAmbos: session.keepBoth,
  tamanoBytes: session.declaredBytes,
  modo: session.mode,
  estado: session.state,
  motivoRechazo: session.rejectionReason,
  archivoId: session.fileId,
  versionId: session.versionId,
  claveObjeto: session.objectKey.value,
  uploadId: session.multipart?.uploadId ?? null,
  partesTotales: session.multipart?.totalParts ?? null,
  tamanoParteBytes: session.multipart?.partSizeBytes ?? null,
  expiraEn: session.expiresAt,
  creadaEn: session.createdAt,
  actualizadaEn: session.updatedAt,
  finalizadaEn: session.finishedAt,
});

/**
 * `IUploadSessionRepository` sobre Postgres (plan §6 «Puertos»). Todo método toma el `EntityManager` de
 * `requireActorScope(actor)`: la RLS de `carga` hace que una carga ajena no exista. No lista cargas vencidas de
 * otros propietarios: eso es `IExpiredUploadScanner`. `@Inject` explícito: con `tsx` no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmUploadSessionRepository implements IUploadSessionRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async insert(actor: Actor, session: UploadSession): Promise<void> {
    await this.context.requireActorScope(actor).insert(CargaOrmEntity, toRow(session));
  }

  async findOwned(actor: Actor, id: string): Promise<UploadSession | null> {
    const row = await this.context.requireActorScope(actor).findOneBy(CargaOrmEntity, { id });
    return row === null ? null : toSession(row);
  }

  async transition(
    actor: Actor,
    id: string,
    from: UploadState,
    to: UploadState,
    patch: UploadTransitionPatch,
  ): Promise<boolean> {
    const result = await this.context
      .requireActorScope(actor)
      .createQueryBuilder()
      .update(CargaOrmEntity)
      .set({
        estado: to,
        motivoRechazo: patch.rejectionReason,
        actualizadaEn: patch.at,
        finalizadaEn: patch.at,
      })
      .where('id = :id AND estado = :from', { id, from })
      .execute();
    return result.affected === 1;
  }
}
