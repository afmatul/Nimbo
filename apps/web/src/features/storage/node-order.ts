import type { NodeSort, SortDirection } from '@nimbo/contracts';

/** Orden del explorador (007 CA-10): campo y dirección de `GET /folders/contents`. Las carpetas van siempre primero. */
export interface NodeOrder {
  readonly sort: NodeSort;
  readonly dir: SortDirection;
}

/** El de 006 (RN-6, D-6): fecha de creación, más recientes primero. */
export const DEFAULT_NODE_ORDER: NodeOrder = { sort: 'created', dir: 'desc' };

export const SORT_LABELS: Readonly<Record<NodeSort, string>> = {
  name: 'Nombre',
  size: 'Tamaño',
  updated: 'Fecha de modificación',
  created: 'Fecha de creación',
};

const BY_DATE: Readonly<Record<SortDirection, string>> = {
  asc: 'Más antiguos primero',
  desc: 'Más recientes primero',
};

/** Textos de la dirección según el campo (mockup `orden-menu`). */
export const DIRECTION_LABELS: Readonly<Record<NodeSort, Readonly<Record<SortDirection, string>>>> =
  {
    name: { asc: 'A–Z', desc: 'Z–A' },
    size: { asc: 'Menor primero', desc: 'Mayor primero' },
    updated: BY_DATE,
    created: BY_DATE,
  };

export function sameOrder(a: NodeOrder, b: NodeOrder): boolean {
  return a.sort === b.sort && a.dir === b.dir;
}

/** «Tamaño, mayor primero», «Nombre, A–Z»: el orden vigente en texto, para el botón y los anuncios. */
export function orderLabel(order: NodeOrder): string {
  const direction = DIRECTION_LABELS[order.sort][order.dir];
  const phrase = order.sort === 'name' ? direction : direction.toLowerCase();
  return `${SORT_LABELS[order.sort]}, ${phrase}`;
}
