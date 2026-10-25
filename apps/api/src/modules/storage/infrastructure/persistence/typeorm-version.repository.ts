import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IVersionRepository } from '../../application/ports/i-version.repository.port';
import { FileVersion } from '../../domain/file-version';
import { ObjectKey } from '../../domain/object-key';

import { VersionArchivoOrmEntity } from './version-archivo.orm-entity';

/** `FileVersion` → fila; también la usa `TypeOrmNodeRepository.insertWithVersion` (DRY). */
export const toVersionRow = (version: FileVersion): VersionArchivoOrmEntity => ({
  id: version.id,
  archivoId: version.fileId,
  numero: version.number,
  restauradaDeNumero: version.restoredFromNumber,
  origen: version.origin,
  claveObjeto: version.objectKey.value,
  tamanoBytes: version.sizeBytes,
  creadoPor: version.createdBy,
  creadaEn: version.createdAt,
  sesionEdicionId: version.editSessionId,
  conservadaHasta: version.keptUntil,
});

const toFileVersion = (row: VersionArchivoOrmEntity): FileVersion =>
  FileVersion.rehydrate({
    id: row.id,
    fileId: row.archivoId,
    number: row.numero,
    origin: row.origen,
    restoredFromNumber: row.restauradaDeNumero,
    objectKey: ObjectKey.parse(row.claveObjeto),
    sizeBytes: row.tamanoBytes,
    createdBy: row.creadoPor,
    createdAt: row.creadaEn,
    editSessionId: row.sesionEdicionId,
    keptUntil: row.conservadaHasta,
  });

/**
 * `IVersionRepository` sobre Postgres (plan 014 §2). Todo método toma el `EntityManager` de
 * `requireActorScope(actor)` y la RLS `version_archivo_cliente` deja ver solo las versiones de archivos propios; el
 * servicio resuelve antes el archivo con `accessibleNodes(actor)`. `uq_version_archivo_numero` sirve a `list` y a
 * `MAX(numero)`; `find` exige el par (versión, archivo): una versión de otro archivo es `null` (CA-11). `@Inject`
 * explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmVersionRepository implements IVersionRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async list(actor: Actor, fileId: string): Promise<readonly FileVersion[]> {
    const rows = await this.manager(actor).find(VersionArchivoOrmEntity, {
      where: { archivoId: fileId },
      order: { numero: 'DESC' },
    });
    return rows.map(toFileVersion);
  }

  async find(actor: Actor, fileId: string, versionId: string): Promise<FileVersion | null> {
    const row = await this.manager(actor).findOne(VersionArchivoOrmEntity, {
      where: { id: versionId, archivoId: fileId },
    });
    return row === null ? null : toFileVersion(row);
  }

  async nextNumber(actor: Actor, fileId: string): Promise<number> {
    const row = await this.manager(actor)
      .createQueryBuilder(VersionArchivoOrmEntity, 'version')
      .select('COALESCE(MAX(version.numero), 0) + 1', 'next')
      .where('version.archivoId = :fileId', { fileId })
      .getRawOne<{ next: number }>();
    if (row === undefined) throw new Error('MAX(numero) no devolvió fila.');
    return Number(row.next);
  }

  async insert(actor: Actor, version: FileVersion): Promise<void> {
    await this.manager(actor).insert(VersionArchivoOrmEntity, toVersionRow(version));
  }

  async markKept(actor: Actor, version: FileVersion): Promise<void> {
    await this.manager(actor).update(
      VersionArchivoOrmEntity,
      { id: version.id, archivoId: version.fileId, conservadaHasta: IsNull() },
      { conservadaHasta: version.keptUntil },
    );
  }

  async delete(actor: Actor, version: FileVersion): Promise<boolean> {
    const result = await this.manager(actor).delete(VersionArchivoOrmEntity, {
      id: version.id,
      archivoId: version.fileId,
    });
    return (result.affected ?? 0) > 0;
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
