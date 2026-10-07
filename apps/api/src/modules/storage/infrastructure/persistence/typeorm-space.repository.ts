import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { accessibleNodes } from '../../../access';
import type { ISpaceRepository } from '../../application/ports/i-space.repository.port';
import type { FileKind } from '../../domain/file-kind';

import { FILE_BYTES_SQL, nodesIn, selectRows } from './node-sql';

interface BytesByKindRow {
  readonly tipo: FileKind;
  readonly bytes: string;
}

/**
 * `ISpaceRepository` sobre Postgres (plan 007 §3). `accessibleNodes(actor)` va dentro de la consulta (ADR-0005) y,
 * además, `propietario_id = actor.id`: cuando 012 sume lo compartido, un archivo ajeno no contará como espacio propio
 * (R-5). La RLS es la segunda barrera.
 */
@Injectable()
export class TypeOrmSpaceRepository implements ISpaceRepository {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async liveBytesByKind(actor: Actor): Promise<ReadonlyMap<FileKind, bigint>> {
    const live = nodesIn(accessibleNodes(actor), 'a.id', 'archivo');
    const rows = await selectRows<BytesByKindRow>(
      this.context.requireActorScope(actor),
      `SELECT a.tipo, SUM(${FILE_BYTES_SQL})::text AS bytes FROM archivo a
        WHERE ${live.sql} AND a.propietario_id = :ownerId GROUP BY a.tipo`,
      { ...live.parameters, ownerId: actor.id },
    );
    return new Map(rows.map((row) => [row.tipo, BigInt(row.bytes)]));
  }
}
