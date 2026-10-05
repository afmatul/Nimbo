/** Criterios de orden del listado. Coinciden con `NODE_SORTS` de `contracts/storage` (spec 007 CA-10). */
export const NODE_SORTS = ['name', 'size', 'updated', 'created'] as const;
export type NodeSort = (typeof NODE_SORTS)[number];

/** Direcciones del orden. Coinciden con `SORT_DIRECTIONS` de `contracts/storage`. */
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Grupo de la fila: el listado da primero las carpetas y después los archivos. */
export type NodeGroup = 'folder' | 'file';

/** Criterio y dirección con que se ordena un grupo. */
export interface NodeOrderKey {
  readonly sort: NodeSort;
  readonly dir: SortDirection;
}

const DEFAULT_SORT: NodeSort = 'created';
const FOLDER_KEY_FOR_SIZE: NodeOrderKey = Object.freeze({ sort: 'name', dir: 'asc' });

const defaultDirectionFor = (sort: NodeSort): SortDirection =>
  sort === 'created' ? 'desc' : 'asc';

/** Orden pedido para el listado de una carpeta (plan 007 D-6, D-7), inmutable. */
export class NodeOrder implements NodeOrderKey {
  private constructor(
    readonly sort: NodeSort,
    readonly dir: SortDirection,
  ) {
    Object.freeze(this);
  }

  /**
   * Resuelve los valores por defecto (D-6): sin `sort`, `created` (el de 006); sin `dir`, descendente con `created`
   * y ascendente con los demás.
   */
  static of(
    sort: NodeSort = DEFAULT_SORT,
    dir: SortDirection = defaultDirectionFor(sort),
  ): NodeOrder {
    return new NodeOrder(sort, dir);
  }

  /** Criterio del grupo (D-7): las carpetas no tienen tamaño, así que con `size` van por nombre ascendente. */
  keyFor(group: NodeGroup): NodeOrderKey {
    if (group === 'folder' && this.sort === 'size') return FOLDER_KEY_FOR_SIZE;
    return this;
  }
}
