import { Inject, Injectable } from '@nestjs/common';
import type { FileIndexStatus } from '@nimbo/contracts';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';
import type { StorageNode } from '../domain/storage-node';

import { I_INDEX_STATUS_READER, I_SHARED_NODE_READER } from './ports/i-node-badge-readers.port';
import type {
  IIndexStatusReader,
  IndexedFileRef,
  ISharedNodeReader,
  NodeRef,
} from './ports/i-node-badge-readers.port';

/** Lo que el explorador agrega a cada nodo listado: si está compartido y, en archivos, su estado de indexación. */
export interface ExplorerBadges {
  readonly shared: ReadonlySet<string>;
  readonly indexStatus: ReadonlyMap<string, FileIndexStatus>;
}

const NO_BADGES: ExplorerBadges = { shared: new Set(), indexStatus: new Map() };

const toNodeRef = (node: StorageNode): NodeRef => ({ type: node.type, id: node.id });

const toIndexedFileRef = (file: File): IndexedFileRef => ({
  id: file.id,
  kind: file.kind,
  currentVersionId: file.currentVersionId,
});

const filesOf = (nodes: readonly StorageNode[]): File[] =>
  nodes.filter((node): node is File => node.type === 'file');

/**
 * Distintivos del explorador («Compartido» e indexación) sobre los nodos que ya devolvió `FolderService.contents` con
 * `accessibleNodes(actor)`: no filtra nada, solo consulta a los dueños de esos datos (`sharing`, `intelligence`) por
 * puertos y en la transacción del actor, con la RLS como segunda barrera.
 */
@Injectable()
export class ExplorerBadgeService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SHARED_NODE_READER) private readonly shares: ISharedNodeReader,
    @Inject(I_INDEX_STATUS_READER) private readonly indexing: IIndexStatusReader,
  ) {}

  async badgesOf(actor: Actor, nodes: readonly StorageNode[]): Promise<ExplorerBadges> {
    if (nodes.length === 0) return NO_BADGES;
    return this.transactions.withActor(actor, async () => ({
      shared: await this.shares.sharedIds(actor, nodes.map(toNodeRef)),
      indexStatus: await this.indexing.statusesOf(actor, filesOf(nodes).map(toIndexedFileRef)),
    }));
  }
}
