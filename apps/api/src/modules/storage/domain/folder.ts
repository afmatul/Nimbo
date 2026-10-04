import { FolderDepthExceededError, InvalidMoveError } from './errors';
import type { FolderName } from './folder-name.vo';
import { FolderPath } from './folder-path';
import type { TrashState } from './trash-state';

export interface CreateFolderInput {
  readonly id: string;
  readonly ownerId: string;
  readonly name: FolderName;
  /** Carpeta que la contiene; `null` es la raíz del propietario. */
  readonly parent: Folder | null;
  /** `FOLDER_MAX_DEPTH` (configuración, CA-9). */
  readonly maxDepth: number;
  readonly now: Date;
}

export interface FolderSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly parentId: string | null;
  readonly name: FolderName;
  readonly path: FolderPath;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** `null` mientras está viva (RN-4). */
  readonly trash: TrashState | null;
}

function assertPathMatches(snapshot: FolderSnapshot): void {
  const { path } = snapshot;
  const parentId = path.ancestorIds().at(-1) ?? null;
  if (path.folderId !== snapshot.id || parentId !== snapshot.parentId) {
    throw new TypeError('La ruta de la carpeta no coincide con su id y su carpeta padre.');
  }
}

function assertWithinDepth(depth: number, maxDepth: number): void {
  if (depth > maxDepth) throw new FolderDepthExceededError(maxDepth, 'place');
}

/**
 * Carpeta (`carpeta`), inmutable. Junto con `File` forma `StorageNode` (DF-61: unión, no clase abstracta). Las
 * reglas del árbol (ciclo, profundidad) se deciden aquí; el movimiento del subárbol lo aplica el repositorio.
 */
export class Folder {
  readonly type = 'folder' as const;
  private readonly data: FolderSnapshot;

  private constructor(snapshot: FolderSnapshot) {
    assertPathMatches(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      createdAt: new Date(snapshot.createdAt.getTime()),
      updatedAt: new Date(snapshot.updatedAt.getTime()),
    });
    Object.freeze(this);
  }

  /** Carpeta nueva y vacía (CA-1). Lanza `FolderDepthExceededError` si `parent` ya está en el máximo (CA-9). */
  static create(input: CreateFolderInput): Folder {
    const { parent, maxDepth, now, ...rest } = input;
    const path = FolderPath.childOf(parent?.path ?? null, rest.id);
    assertWithinDepth(path.depth, maxDepth);
    return new Folder({
      ...rest,
      parentId: parent?.id ?? null,
      path,
      createdAt: now,
      updatedAt: now,
      trash: null,
    });
  }

  static rehydrate(snapshot: FolderSnapshot): Folder {
    return new Folder(snapshot);
  }

  get id(): string {
    return this.data.id;
  }

  get ownerId(): string {
    return this.data.ownerId;
  }

  get parentId(): string | null {
    return this.data.parentId;
  }

  get name(): FolderName {
    return this.data.name;
  }

  get path(): FolderPath {
    return this.data.path;
  }

  get depth(): number {
    return this.data.path.depth;
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.data.updatedAt.getTime());
  }

  get trash(): TrashState | null {
    return this.data.trash;
  }

  /**
   * Comprueba que esta carpeta pueda pasar a `newParent` (`null` = raíz): no dentro de sí misma ni de una
   * descendiente (CA-8) y sin que su subárbol supere `maxDepth` (CA-9). `subtreeMaxDepth` es la profundidad de su
   * descendiente vivo más hondo (la propia si no tiene).
   */
  assertCanMoveTo(newParent: Folder | null, subtreeMaxDepth: number, maxDepth: number): void {
    if (newParent !== null && this.path.contains(newParent.path)) throw new InvalidMoveError();
    const deepest = this.path.subtreeDepthUnder(newParent?.path ?? null, subtreeMaxDepth);
    assertWithinDepth(deepest, maxDepth);
  }

  snapshot(): FolderSnapshot {
    return { ...this.data, createdAt: this.createdAt, updatedAt: this.updatedAt };
  }
}
