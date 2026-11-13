import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { ISharedNodeReader, NodeRef } from '../../../storage';

import { queryNamed } from './query-named';

/**
 * Nodos propios del actor con comparticiones o, si son archivos, con un enlace público vigente (sin revocar ni
 * vencido). `propietario_id = :owner_id` deja fuera lo compartido con el actor: el distintivo es solo del dueño.
 */
const SHARED_IDS_SQL = `
  SELECT archivo_id AS id FROM comparticion
   WHERE propietario_id = :owner_id::uuid AND archivo_id = ANY(:file_ids::uuid[])
  UNION
  SELECT carpeta_id AS id FROM comparticion
   WHERE propietario_id = :owner_id::uuid AND carpeta_id = ANY(:folder_ids::uuid[])
  UNION
  SELECT archivo_id AS id FROM enlace_publico
   WHERE propietario_id = :owner_id::uuid AND archivo_id = ANY(:file_ids::uuid[])
     AND revocado_en IS NULL AND vence_en > now()`;

const idsOfType = (nodes: readonly NodeRef[], type: NodeRef['type']): string[] =>
  nodes.filter((node) => node.type === type).map((node) => node.id);

/**
 * `ISharedNodeReader` de `storage` sobre `comparticion` y `enlace_publico` (dueño: `sharing`). Corre con el
 * `EntityManager` de `withActor`: la RLS de ambas tablas es la segunda barrera.
 */
@Injectable()
export class SqlSharedNodeReader implements ISharedNodeReader {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async sharedIds(actor: Actor, nodes: readonly NodeRef[]): Promise<ReadonlySet<string>> {
    const rows = await queryNamed<{ id: string }>(
      this.context.requireActorScope(actor),
      SHARED_IDS_SQL,
      {
        owner_id: actor.id,
        file_ids: idsOfType(nodes, 'file'),
        folder_ids: idsOfType(nodes, 'folder'),
      },
    );
    return new Set(rows.map((row) => row.id));
  }
}
