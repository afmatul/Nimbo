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

const EMPTY: ReadonlyMap<string, NodeSummary> = new Map();

export const batchItemOf = ({ type, id }: NodeSummary): BatchItem => ({ type, id });

function allStateOf(nodes: readonly NodeSummary[], isSelected: (id: string) => boolean) {
  const count = nodes.filter((node) => isSelected(node.id)).length;
  if (count === 0) return 'none';
  return count === nodes.length ? 'all' : 'some';
}

/**
 * Selección múltiple del explorador (mockup p. 12): casilla por fila y «Seleccionar todo» sobre `nodes`, los elementos
 * de la ubicación abierta. `scope` es la carpeta abierta: al cambiar, la selección empieza vacía.
 */
export function useNodeSelection(nodes: readonly NodeSummary[], scope: string): NodeSelection {
  const [state, setState] = React.useState(() => ({ scope, chosen: EMPTY }));
  const chosen = state.scope === scope ? state.chosen : EMPTY;
  const setChosen = (
    update: (previous: ReadonlyMap<string, NodeSummary>) => ReadonlyMap<string, NodeSummary>,
  ) =>
    setState((previous) => ({
      scope,
      chosen: update(previous.scope === scope ? previous.chosen : EMPTY),
    }));
  const isSelected = (nodeId: string): boolean => chosen.has(nodeId);
  const toggle = (node: NodeSummary): void =>
    setChosen((previous) => {
      const next = new Map(previous);
      if (!next.delete(node.id)) next.set(node.id, node);
      return next;
    });
  const allState = allStateOf(nodes, isSelected);
  const toggleAll = (): void =>
    setChosen(() => (allState === 'all' ? EMPTY : new Map(nodes.map((node) => [node.id, node]))));
  return {
    selected: [...chosen.values()],
    isSelected,
    toggle,
    allState,
    toggleAll,
    clear: () => setChosen(() => EMPTY),
  };
}
