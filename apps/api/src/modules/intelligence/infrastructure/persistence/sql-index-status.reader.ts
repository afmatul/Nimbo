import { Inject, Injectable } from '@nestjs/common';
import type { FileIndexStatus } from '@nimbo/contracts';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type { IIndexStatusReader, IndexedFileRef } from '../../../storage';
import { ExtractorRegistry } from '../../application/extractor-registry';
import type { IndexingState } from '../../domain/file-indexing';

/** Estado de `indexacion` → estado del explorador; `no_indexable` es «no compatible» como un tipo sin extractor. */
const EXPLORER_STATUS: Readonly<Record<IndexingState, FileIndexStatus>> = {
  pendiente: 'pending',
  indexando: 'processing',
  indexado: 'indexed',
  fallido: 'failed',
  no_indexable: 'unsupported',
};

/** Sin fila todavía, un tipo indexable está en cola (la conciliación la crea, 019 RN-12), como `IndexStatusService`. */
const NOT_STARTED: FileIndexStatus = 'pending';

const STATES_SQL =
  'SELECT version_archivo_id AS "versionId", estado AS state FROM indexacion WHERE version_archivo_id = ANY($1::uuid[])';

/**
 * `IIndexStatusReader` de `storage` (explorador): una sola consulta por página sobre `indexacion` con el
 * `EntityManager` de `withActor` (la RLS deja ver solo las filas de los archivos propios: en lo compartido con el actor
 * un archivo indexable queda `pending`). `ExtractorRegistry` sigue siendo la única fuente de «qué es indexable».
 */
@Injectable()
export class SqlIndexStatusReader implements IIndexStatusReader {
  constructor(
    @Inject(TransactionContext) private readonly context: TransactionContext,
    @Inject(ExtractorRegistry) private readonly extractors: ExtractorRegistry,
  ) {}

  async statusesOf(
    actor: Actor,
    files: readonly IndexedFileRef[],
  ): Promise<ReadonlyMap<string, FileIndexStatus>> {
    const indexable = files.filter((file) => this.extractors.supports(file.kind));
    const states = await this.statesByVersion(actor, indexable);
    const statusOf = (file: IndexedFileRef): FileIndexStatus => {
      if (!this.extractors.supports(file.kind)) return 'unsupported';
      const state = states.get(file.currentVersionId);
      return state === undefined ? NOT_STARTED : EXPLORER_STATUS[state];
    };
    return new Map(files.map((file) => [file.id, statusOf(file)]));
  }

  private async statesByVersion(
    actor: Actor,
    files: readonly IndexedFileRef[],
  ): Promise<ReadonlyMap<string, IndexingState>> {
    if (files.length === 0) return new Map();
    const versionIds = files.map((file) => file.currentVersionId);
    const rows = (await this.context.requireActorScope(actor).query(STATES_SQL, [versionIds])) as {
      versionId: string;
      state: IndexingState;
    }[];
    return new Map(rows.map((row) => [row.versionId, row.state]));
  }
}
