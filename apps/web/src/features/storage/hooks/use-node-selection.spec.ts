/**
 * @jest-environment jsdom
 */
import type { NodeSummary } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';

import { useNodeSelection } from './use-node-selection';

const AT = '2026-11-01T10:00:00.000Z';
const node = (id: string): NodeSummary => ({
  type: 'folder',
  id,
  name: `Carpeta ${id}`,
  parentId: null,
  createdAt: AT,
  updatedAt: AT,
});
const NODES = [node('a'), node('b'), node('c')];

describe('useNodeSelection: selección múltiple del explorador', () => {
  it('marca y desmarca filas; el encabezado pasa de ninguno a algunos', () => {
    const { result } = renderHook(() => useNodeSelection(NODES, 'raiz'));
    expect(result.current.allState).toBe('none');

    act(() => result.current.toggle(NODES[1] as NodeSummary));
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.allState).toBe('some');

    act(() => result.current.toggle(NODES[1] as NodeSummary));
    expect(result.current.selected).toEqual([]);
  });

  it('«Seleccionar todo» marca toda la ubicación y, con todo marcado, la desmarca', () => {
    const { result } = renderHook(() => useNodeSelection(NODES, 'raiz'));

    act(() => result.current.toggleAll());
    expect(result.current.allState).toBe('all');
    expect(result.current.selected.map((selected) => selected.id)).toEqual(['a', 'b', 'c']);

    act(() => result.current.toggleAll());
    expect(result.current.allState).toBe('none');
  });

  it('al abrir otra carpeta (otro `scope`) la selección empieza vacía', () => {
    const { result, rerender } = renderHook(({ scope }) => useNodeSelection(NODES, scope), {
      initialProps: { scope: 'raiz' },
    });
    act(() => result.current.toggleAll());

    rerender({ scope: 'otra' });
    expect(result.current.selected).toEqual([]);
  });

  it('«Quitar selección» la vacía', () => {
    const { result } = renderHook(() => useNodeSelection(NODES, 'raiz'));
    act(() => result.current.toggleAll());

    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
  });
});
