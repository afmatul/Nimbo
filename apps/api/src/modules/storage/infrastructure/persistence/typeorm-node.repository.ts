import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';
import type {
  FileListPage,
  FileListQuery,
  INodeRepository,
} from '../../application/ports/i-node.repository.port';
import { File } from '../../domain/file';
import { FileName } from '../../domain/file-name.vo';
import type { FileVersion } from '../../domain/file-version';

import { ArchivoOrmEntity } from './archivo.orm-entity';
import { decodeFileListCursor, encodeFileListCursor } from './file-list-cursor';
import { VersionArchivoOrmEntity } from './version-archivo.orm-entity';

const ALIAS = 'archivo';
/** Comodines de `LIKE` y su carácter de escape: en un nombre son texto, no patrones. */
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

const escapeLike = (text: string): string => text.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');

/** Patrón `LIKE` de las copias «base (n).ext» (o «base (n)») de `name` (D-4). */
const copiesPattern = (name: FileName): string => {
  const extension = name.extension();
  const base = extension === '' ? name.value : name.value.slice(0, -(extension.length + 1));
  const tail = extension === '' ? '' : `.${escapeLike(extension)}`;
  return `${escapeLike(base)} (%)${tail}`;
};

const toFile = (row: ArchivoOrmEntity): File =>
  File.rehydrate({
    id: row.id,
    ownerId: row.propietarioId,
    name: FileName.of(row.nombre),
    kind: row.tipo,
    sizeBytes: row.tamanoBytes,
    currentVersionId: row.versionActualId,
    createdAt: row.creadoEn,
    updatedAt: row.actualizadoEn,
    deletedAt: row.eliminadoEn,
  });

/**
 * `INodeRepository` sobre Postgres (plan §6 «Puertos», D-17). Toda lectura une `accessibleNodes(actor)` en la misma
 * consulta y todo método toma el `EntityManager` de `requireActorScope(actor)`: la RLS es la segunda barrera, no la
 * única. `@Inject` explícito: con `tsx` (esbuild) no hay `design:paramtypes`.
 */
@Injectable()
export class TypeOrmNodeRepository implements INodeRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async findAccessibleById(actor: Actor, id: string): Promise<File | null> {
    const row = await this.accessibleFiles(actor)
      .andWhere(`${ALIAS}.id = :id`, { id })
      .getOne();
    return row === null ? null : toFile(row);
  }

  async listAccessible(actor: Actor, query: FileListQuery): Promise<FileListPage> {
    const builder = this.accessibleFiles(actor)
      .orderBy(`${ALIAS}.creadoEn`, 'DESC')
      .addOrderBy(`${ALIAS}.id`, 'DESC')
      .limit(query.limit + 1);
    if (query.cursor !== undefined) {
      const after = decodeFileListCursor(query.cursor);
      builder.andWhere(`(${ALIAS}.creadoEn, ${ALIAS}.id) < (:afterCreatedAt, :afterId)`, {
        afterCreatedAt: after.createdAt,
        afterId: after.id,
      });
    }
    const rows = await builder.getMany();
    const items = rows.slice(0, query.limit).map(toFile);
    const last = items.at(-1);
    const hasMore = rows.length > query.limit && last !== undefined;
    return {
      items,
      nextCursor: hasMore ? encodeFileListCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async findTakenNames(actor: Actor, name: FileName): Promise<readonly string[]> {
    const rows = await this.accessibleFiles(actor)
      .select([`${ALIAS}.id`, `${ALIAS}.nombre`])
      .andWhere(
        `(lower(${ALIAS}.nombre) = lower(:exactName) OR lower(${ALIAS}.nombre) LIKE lower(:copies) ESCAPE '\\')`,
        { exactName: name.value, copies: copiesPattern(name) },
      )
      .getMany();
    return rows.map((row) => row.nombre);
  }

  async insertWithVersion(actor: Actor, file: File, version: FileVersion): Promise<void> {
    const manager = this.context.requireActorScope(actor);
    await manager.insert(ArchivoOrmEntity, {
      id: file.id,
      propietarioId: file.ownerId,
      nombre: file.name.value,
      tipo: file.kind,
      tamanoBytes: file.sizeBytes,
      versionActualId: file.currentVersionId,
      creadoEn: file.createdAt,
      actualizadoEn: file.updatedAt,
      eliminadoEn: file.deletedAt,
    });
    await manager.insert(VersionArchivoOrmEntity, {
      id: version.id,
      archivoId: version.fileId,
      origen: version.origin,
      claveObjeto: version.objectKey.value,
      tamanoBytes: version.sizeBytes,
      creadoPor: version.createdBy,
      creadaEn: version.createdAt,
    });
  }

  /** Archivos del actor fuera de la papelera: el fragmento de `access` va dentro de la consulta (ADR-0005). */
  private accessibleFiles(actor: Actor): SelectQueryBuilder<ArchivoOrmEntity> {
    const manager: EntityManager = this.context.requireActorScope(actor);
    const fragment = accessibleNodes(actor);
    return manager
      .createQueryBuilder(ArchivoOrmEntity, ALIAS)
      .where(`${ALIAS}.id IN (SELECT nodo_id FROM (${fragment.sql}) accesibles)`, {
        ...fragment.parameters,
      })
      .andWhere(`${ALIAS}.eliminadoEn IS NULL`);
  }
}
