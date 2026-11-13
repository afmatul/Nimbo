'use client';

import type { BatchItem, NodeSummary } from '@nimbo/contracts';
import * as React from 'react';

/** «Seleccionar todo» del encabezado: ninguno, algunos (indeterminado) o todos los de la ubicación abierta. */
export type SelectAllState = 'none' | 'some' | 'all';

export interface NodeSelection {
  /** Lo seleccionado, en el orden en que se eligió. */
  readonly selected: readonly NodeSummary[];
  readonly isSelected: (nodeId: string) => boolean;
  readonly toggle: (node: NodeSummary) => void;
  readonly allState: SelectAllState;
  /** Con todo marcado, desmarca; si no, marca todos los de la ubicación abierta. */
  readonly toggleAll: () => void;
  readonly clear: () => void;
}

type Chosen = ReadonlyMap<string, NodeSummary>;

const EMPTY: Chosen = new Map();

/** `scope` de la raíz (`/archivos`), el mismo que usa «Mis archivos». */
export const ROOT_SELECTION_SCOPE = 'raiz';

export const batchItemOf = ({ type, id }: NodeSummary): BatchItem => ({ type, id });

/** Carpeta que contiene el nodo, con la raíz como `ROOT_SELECTION_SCOPE`. */
const containerOf = (node: NodeSummary): string =>
  (node.type === 'file' ? node.folderId : node.parentId) ?? ROOT_SELECTION_SCOPE;

/**
 * Lo elegido según la lista actual: un nodo de la ubicación abierta toma su versión de `nodes` (nombre renombrado) y,
 * si ya no está (papelera, movido), deja de contar. Lo de una carpeta desglosada no está en `nodes` y se conserva.
 */
function currentOf(chosen: Chosen, nodes: readonly NodeSummary[], scope: string): Chosen {
  if (chosen.size === 0) return chosen;
  const shown = new Map(nodes.map((node) => [node.id, node]));
  const current = new Map<string, NodeSummary>();
  for (const [id, node] of chosen) {
    const fresh = shown.get(id) ?? (containerOf(node) === scope ? undefined : node);
    if (fresh !== undefined) current.set(id, fresh);
  }
  return current;
}

function allStateOf(nodes: readonly NodeSummary[], chosen: Chosen): SelectAllState {
  const count = nodes.filter((node) => chosen.has(node.id)).length;
  if (count === 0) return 'none';
  return count === nodes.length ? 'all' : 'some';
}

/** Marca o desmarca los de la ubicación abierta sin tocar lo elegido dentro de carpetas desglosadas. */
function withAll(chosen: Chosen, nodes: readonly NodeSummary[], select: boolean): Chosen {
  const next = new Map(chosen);
  for (const node of nodes) {
    if (select) next.set(node.id, node);
    else next.delete(node.id);
  }
  return next;
}

/** Elegido por `scope`: al cambiar de carpeta, lo anterior deja de contar. */
function useScopedChosen(scope: string) {
  const [state, setState] = React.useState(() => ({ scope, chosen: EMPTY }));
  const chosen = state.scope === scope ? state.chosen : EMPTY;
  const update = (change: (previous: Chosen) => Chosen): void =>
    setState((previous) => ({
      scope,
      chosen: change(previous.scope === scope ? previous.chosen : EMPTY),
    }));
  return [chosen, update] as const;
}

/**
 * Selección múltiple del explorador (mockup p. 12): casilla por fila y «Seleccionar todo» sobre `nodes`, los elementos
 * de la ubicación abierta. `scope` es la carpeta abierta (`ROOT_SELECTION_SCOPE` en la raíz): al cambiar, la selección
 * empieza vacía.
 */
export function useNodeSelection(nodes: readonly NodeSummary[], scope: string): NodeSelection {
  const [stored, update] = useScopedChosen(scope);
  const chosen = currentOf(stored, nodes, scope);
  const allState = allStateOf(nodes, chosen);
  const toggle = (node: NodeSummary): void =>
    update((previous) => {
      const next = new Map(currentOf(previous, nodes, scope));
      if (!next.delete(node.id)) next.set(node.id, node);
      return next;
    });
  return {
    selected: [...chosen.values()],
    isSelected: (nodeId) => chosen.has(nodeId),
    toggle,
    allState,
    toggleAll: () =>
      update((previous) => withAll(currentOf(previous, nodes, scope), nodes, allState !== 'all')),
    clear: () => update(() => EMPTY),
  };
}
