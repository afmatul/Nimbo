import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_NODE_FIELD_MESSAGES } from '@nimbo/contracts';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import {
  FolderNameConflictError,
  InvalidNodeRequestError,
  NodeNotFoundError,
} from '../domain/errors';
import { Folder } from '../domain/folder';
import { FolderName } from '../domain/folder-name.vo';
import type { NodeOrder } from '../domain/node-order';

import { FOLDER_CONFIG } from './folder-config';
import type { FolderConfig } from './folder-config';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository, NodeListPage } from './ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { WritableAccountPolicy } from './writable-account.policy';

/** Carpeta nueva: nombre tal como llegó y su carpeta padre (`null` = raíz). */
export interface CreateFolderCommand {
  readonly name: string;
  readonly parentId: string | null;
}

/** Página pedida de una carpeta (`folderId: null` = raíz) en el orden `order` (007 CA-10). */
export interface FolderContentsQuery {
  readonly folderId: string | null;
  readonly order: NodeOrder;
  readonly cursor?: string;
  readonly limit: number;
}

/** Carpeta abierta (`null` en la raíz), sus migas desde la raíz hasta ella y una página de su contenido (CA-5). */
export interface FolderContents {
  readonly folder: Folder | null;
  readonly breadcrumbs: readonly Folder[];
  readonly page: NodeListPage;
}

/**
 * Carpetas del actor (plan 006 §2): crear, renombrar, mover y abrir. Cada mutación corre en `withActor` y toma primero
 * `lockUsage` (la fila del dueño), así dos cambios del árbol del mismo dueño no se cruzan en un ciclo ni en un nombre
 * repetido. Lo ajeno, inexistente o en la papelera es el mismo `NodeNotFoundError` (CA-5, CA-22). No se audita (CA-24).
 */
@Injectable()
export class FolderService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FOLDER_CONFIG) private readonly config: FolderConfig,
    @Inject(WritableAccountPolicy) private readonly writable: WritableAccountPolicy,
  ) {}

  /** CA-1, CA-2, CA-3, CA-9: carpeta vacía en la raíz o dentro de una propia. */
  async create(actor: Actor, command: CreateFolderCommand): Promise<Folder> {
    const name = parseFolderName(command.name);
    await this.writable.assertWritable(actor);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const parent = await this.findParent(actor, command.parentId);
      const folder = Folder.create({
        id: randomUUID(),
        ownerId: actor.id,
        name,
        parent,
        maxDepth: this.config.maxDepth,
        now: this.clock.now(),
      });
      await this.assertNameFree(actor, name, folder.parentId);
      await this.nodes.insertFolder(actor, folder);
      return folder;
    });
  }

  /** CA-2, CA-3, CA-4: otro nombre en la misma carpeta; solo cambiar mayúsculas no choca consigo misma. */
  async rename(actor: Actor, folderId: string, rawName: string): Promise<Folder> {
    const name = parseFolderName(rawName);
    await this.writable.assertWritable(actor);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const folder = await this.requireFolder(actor, folderId);
      await this.assertNameFree(actor, name, folder.parentId, folder.id);
      const renamed = Folder.rehydrate({ ...folder.snapshot(), name, updatedAt: this.clock.now() });
      await this.nodes.renameFolder(actor, renamed);
      return renamed;
    });
  }

  /** CA-3, CA-7, CA-8, CA-9: la carpeta y su subárbol pasan a `parentId` (`null` = raíz). */
  async move(actor: Actor, folderId: string, parentId: string | null): Promise<Folder> {
    await this.writable.assertWritable(actor);
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const folder = await this.requireFolder(actor, folderId);
      const parent = await this.findParent(actor, parentId);
      const deepest = await this.nodes.maxSubtreeDepth(actor, folder);
      folder.assertCanMoveTo(parent, deepest, this.config.maxDepth);
      await this.assertNameFree(actor, folder.name, parent?.id ?? null, folder.id);
      const moved = Folder.rehydrate({
        ...folder.snapshot(),
        parentId: parent?.id ?? null,
        path: folder.path.rebase(folder.path, parent?.path ?? null),
        updatedAt: this.clock.now(),
      });
      await this.nodes.moveFolderSubtree(actor, folder, moved);
      return moved;
    });
  }

  /** CA-5: subcarpetas y archivos directos, carpetas primero, con las migas desde la raíz. */
  contents(actor: Actor, query: FolderContentsQuery): Promise<FolderContents> {
    return this.transactions.withActor(actor, async () => {
      const folder = await this.findParent(actor, query.folderId);
      const ancestors = folder === null ? [] : await this.nodes.breadcrumbs(actor, folder);
      const page = await this.nodes.listContents(actor, query);
      return { folder, breadcrumbs: folder === null ? [] : [...ancestors, folder], page };
    });
  }

  /** `null` es la raíz; un id que el actor no ve es `NodeNotFoundError`. */
  private async findParent(actor: Actor, folderId: string | null): Promise<Folder | null> {
    return folderId === null ? null : this.requireFolder(actor, folderId);
  }

  private async requireFolder(actor: Actor, folderId: string): Promise<Folder> {
    const folder = await this.nodes.findAccessibleFolder(actor, folderId);
    if (folder === null) throw new NodeNotFoundError();
    return folder;
  }

  /** CA-3: unicidad entre carpetas hermanas vivas, sin distinguir mayúsculas; `exceptId` es la carpeta que cambia. */
  private async assertNameFree(
    actor: Actor,
    name: FolderName,
    parentId: string | null,
    exceptId?: string,
  ): Promise<void> {
    const taken = await this.nodes.findTakenFolderNames(actor, name, parentId, exceptId);
    if (!name.firstFree(taken).sameAs(name)) throw new FolderNameConflictError();
  }
}

/** El esquema de la petición ya validó la forma; esto normaliza y cubre a quien llame sin pasar por él (CA-2). */
function parseFolderName(raw: string): FolderName {
  const parsed = FolderName.parse(raw);
  if (parsed.ok) return parsed.name;
  throw new InvalidNodeRequestError([
    { field: 'name', reason: parsed.reason, message: STORAGE_NODE_FIELD_MESSAGES[parsed.reason] },
  ]);
}
