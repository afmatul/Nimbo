import type { File } from './file';
import type { Folder } from './folder';

/** Nodo del árbol de un propietario (Composite de M2). Unión discriminada por `type`, no clase abstracta (DF-61). */
export type StorageNode = File | Folder;
