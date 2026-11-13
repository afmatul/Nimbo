import { Inject, Injectable } from '@nestjs/common';
import { BATCH_MAX_ITEMS, FILES_PAGE_MAX } from '@nimbo/contracts';

import { I_TRANSACTION_RUNNER, settleEach } from '../../../shared';
import type { Actor, ITransactionRunner, Settlement } from '../../../shared';
import { BatchTooLargeError, NodeNotFoundError } from '../domain/errors';
import type { File } from '../domain/file';
import type { Folder } from '../domain/folder';
import { NodeOrder } from '../domain/node-order';

import { FileService } from './file.service';
import type { NodeRef } from './ports/i-node-badge-readers.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';

/** Una URL prefirmada de la versión vigente de un archivo, con el nombre con que se guarda. */
export interface BatchDownloadEntry {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

export interface BatchDownload {
  readonly downloads: readonly BatchDownloadEntry[];
  readonly failed: Settlement<NodeRef>['failed'];
}

type BatchNodes = Pick<
  INodeRepository,
  'findAccessibleById' | 'findAccessibleFolder' | 'listContents'
>;

const BY_DEFAULT = NodeOrder.of();

const fileRef = (file: File): NodeRef => ({ type: 'file', id: file.id });

/**
 * Descarga por lote: resuelve cada elemento con `accessibleNodes(actor)` (también lo compartido) y expande las
 * carpetas a sus archivos accesibles, en una sola transacción del actor; luego firma cada archivo con
 * `FileService.getDownloadUrl` (misma tasa, firma de 5 min y auditoría que la descarga individual). El lote no pasa
 * de `BATCH_MAX_ITEMS` archivos: la carpeta que no cabe falla con `STORAGE_BATCH_TOO_LARGE`.
 */
@Injectable()
export class BatchDownloadService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: BatchNodes,
    @Inject(FileService) private readonly files: Pick<FileService, 'getDownloadUrl'>,
  ) {}

  async download(actor: Actor, items: readonly NodeRef[]): Promise<BatchDownload> {
    const files: File[] = [];
    const resolved = await this.transactions.withActor(actor, () =>
      settleEach(items, async (item) => {
        files.push(...(await this.filesOf(actor, item, BATCH_MAX_ITEMS - files.length)));
      }),
    );
    const downloads: BatchDownloadEntry[] = [];
    const signed = await settleEach(files, async (file) => {
      const { url } = await this.files.getDownloadUrl(actor, file.id);
      downloads.push({ id: file.id, name: file.name.value, url });
    });
    const unsigned = signed.failed.map(({ item, code }) => ({ item: fileRef(item), code }));
    return { downloads, failed: [...resolved.failed, ...unsigned] };
  }

  private async filesOf(actor: Actor, item: NodeRef, room: number): Promise<readonly File[]> {
    if (item.type === 'file') {
      const file = await this.nodes.findAccessibleById(actor, item.id);
      if (file === null) throw new NodeNotFoundError();
      if (room < 1) throw new BatchTooLargeError(BATCH_MAX_ITEMS);
      return [file];
    }
    const folder = await this.nodes.findAccessibleFolder(actor, item.id);
    if (folder === null) throw new NodeNotFoundError();
    return this.filesUnder(actor, folder, room);
  }

  /** Recorre el subárbol por niveles; corta en cuanto pasa de `room` archivos. */
  private async filesUnder(actor: Actor, root: Folder, room: number): Promise<readonly File[]> {
    const found: File[] = [];
    const pending: string[] = [root.id];
    for (let folderId = pending.shift(); folderId !== undefined; folderId = pending.shift()) {
      for await (const node of this.childrenOf(actor, folderId)) {
        if (node.type === 'folder') pending.push(node.id);
        else found.push(node);
        if (found.length > room) throw new BatchTooLargeError(BATCH_MAX_ITEMS);
      }
    }
    return found;
  }

  private async *childrenOf(actor: Actor, folderId: string): AsyncGenerator<File | Folder> {
    const query = { folderId, order: BY_DEFAULT, limit: FILES_PAGE_MAX };
    let page = await this.nodes.listContents(actor, query);
    yield* page.items;
    while (page.nextCursor !== null) {
      page = await this.nodes.listContents(actor, { ...query, cursor: page.nextCursor });
      yield* page.items;
    }
  }
}
