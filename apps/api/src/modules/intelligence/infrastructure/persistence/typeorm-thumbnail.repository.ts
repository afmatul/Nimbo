import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  IThumbnailRepository,
  NewThumbnail,
} from '../../application/ports/i-thumbnail-repository.port';

import { MiniaturaOrmEntity } from './miniatura.orm-entity';

/** Una petición repetida choca con `uq_miniatura_version` y no aborta la transacción. */
const INSERT_IF_ABSENT_SQL = `
  INSERT INTO miniatura (id, archivo_id, version_archivo_id, texto, creado_en)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (version_archivo_id) DO NOTHING`;

/** `IThumbnailRepository` sobre Postgres; la RLS de `miniatura` es la segunda barrera. `@Inject` explícito (tsx). */
@Injectable()
export class TypeOrmThumbnailRepository implements IThumbnailRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async find(actor: Actor, versionId: string): Promise<{ readonly text: string | null } | null> {
    const row = await this.manager(actor).findOne(MiniaturaOrmEntity, {
      where: { versionArchivoId: versionId },
    });
    return row === null ? null : { text: row.texto };
  }

  async insertIfAbsent(actor: Actor, thumbnail: NewThumbnail): Promise<void> {
    await this.manager(actor).query(INSERT_IF_ABSENT_SQL, [
      thumbnail.id,
      thumbnail.fileId,
      thumbnail.versionId,
      thumbnail.text,
      thumbnail.createdAt,
    ]);
  }

  private manager(actor: Actor): EntityManager {
    return this.context.requireActorScope(actor);
  }
}
