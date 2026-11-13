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

  it('un elemento que ya no está en la ubicación abierta (papelera, movido) deja de contar', () => {
    const { result, rerender } = renderHook(({ nodes }) => useNodeSelection(nodes, 'raiz'), {
      initialProps: { nodes: NODES },
    });
    act(() => result.current.toggleAll());

    rerender({ nodes: [node('a'), node('c')] });
    expect(result.current.selected.map((selected) => selected.id)).toEqual(['a', 'c']);
    expect(result.current.isSelected('b')).toBe(false);
    expect(result.current.allState).toBe('all');
  });

  it('toma el nombre actual de la lista (renombrado desde la fila)', () => {
    const { result, rerender } = renderHook(({ nodes }) => useNodeSelection(nodes, 'raiz'), {
      initialProps: { nodes: NODES },
    });
    act(() => result.current.toggle(NODES[0] as NodeSummary));

    rerender({ nodes: [{ ...node('a'), name: 'Nuevo nombre' }, node('b'), node('c')] });
    expect(result.current.selected.map((selected) => selected.name)).toEqual(['Nuevo nombre']);
  });

  it('lo elegido dentro de una carpeta desglosada se conserva con «Seleccionar todo»', () => {
    const nested: NodeSummary = {
      type: 'folder',
      id: 'n',
      name: 'n',
      parentId: 'a',
      createdAt: AT,
      updatedAt: AT,
    };
    const { result } = renderHook(() => useNodeSelection(NODES, 'raiz'));
    act(() => result.current.toggle(nested));

    act(() => result.current.toggleAll());
    expect(result.current.selected.map((selected) => selected.id)).toEqual(['n', 'a', 'b', 'c']);

    act(() => result.current.toggleAll());
    expect(result.current.selected.map((selected) => selected.id)).toEqual(['n']);
  });
});
