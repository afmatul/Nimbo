/**
 * @jest-environment jsdom
 */
import type { NodeSummary } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NodeOrder } from '../node-order';

import { NodeTable, type NodeTableProps } from './node-table';

const CREATED = '2026-08-01T10:00:00.000Z';
const UPDATED = '2026-09-28T10:00:00.000Z';

const FOLDER: NodeSummary = {
  type: 'folder',
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Anexos',
  parentId: null,
  createdAt: CREATED,
  updatedAt: UPDATED,
};

const FILE: NodeSummary = {
  type: 'file',
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'Informe.pdf',
  sizeBytes: 1_500,
  kind: 'pdf',
  folderId: null,
  createdAt: CREATED,
  updatedAt: UPDATED,
};

function renderTable(overrides: Partial<NodeTableProps> = {}): void {
  render(
    <NodeTable
      nodes={[FOLDER, FILE]}
      placeName="Mis archivos"
      renderRowActions={undefined}
      {...overrides}
    />,
  );
}

function header(name: string): HTMLElement {
  return screen.getByRole('columnheader', { name });
}

function sortingWith(order: NodeOrder, onSort = jest.fn()): Partial<NodeTableProps> {
  return { sorting: { order, onSort } };
}

describe('NodeTable: orden y columna «Modificado» (007 CA-10)', () => {
  it('CA-10: «Modificado» muestra updatedAt, no la fecha de creación, en carpetas y archivos', () => {
    renderTable();

    const times = Array.from(document.querySelectorAll('tbody time'));
    expect(times.length).toBeGreaterThan(0);
    expect(times.every((time) => time.getAttribute('dateTime') === UPDATED)).toBe(true);
  });

  it('CA-10: a 360 px la segunda línea del archivo dice tamaño y fecha de modificación', () => {
    renderTable();

    const line = document.querySelector('[data-testid="file-size-mobile"]');
    expect(line?.textContent).toContain('1,5 KB');
    expect(line?.querySelector('time')?.getAttribute('dateTime')).toBe(UPDATED);
  });

  it('CA-10: Nombre, Tamaño y Modificado son botones de orden; la columna activa lleva aria-sort', () => {
    renderTable(sortingWith({ sort: 'size', dir: 'desc' }));

    expect(header('Tamaño').getAttribute('aria-sort')).toBe('descending');
    expect(header('Nombre').hasAttribute('aria-sort')).toBe(false);
    expect(header('Modificado').hasAttribute('aria-sort')).toBe(false);
    for (const name of ['Nombre', 'Tamaño', 'Modificado']) {
      expect(within(header(name)).getByRole('button', { name })).toBeTruthy();
    }
  });

  it.each([
    ['name', 'asc', 'Nombre', 'ascending'],
    ['updated', 'desc', 'Modificado', 'descending'],
  ] as const)('CA-10: orden %s %s marca «%s» como %s', (sort, dir, column, ariaSort) => {
    renderTable(sortingWith({ sort, dir }));

    expect(header(column).getAttribute('aria-sort')).toBe(ariaSort);
  });

  it('CA-10: con el orden por fecha de creación ninguna columna lleva aria-sort (la tabla muestra «Modificado»)', () => {
    renderTable(sortingWith({ sort: 'created', dir: 'desc' }));

    expect(document.querySelectorAll('th[aria-sort]')).toHaveLength(0);
  });

  it('CA-10: pulsar una columna inactiva ordena por ella ascendente; la activa invierte la dirección', async () => {
    const onSort = jest.fn();
    renderTable(sortingWith({ sort: 'size', dir: 'desc' }, onSort));

    await userEvent.click(within(header('Nombre')).getByRole('button'));
    await userEvent.click(within(header('Tamaño')).getByRole('button'));

    expect(onSort.mock.calls).toEqual([
      [{ sort: 'name', dir: 'asc' }],
      [{ sort: 'size', dir: 'asc' }],
    ]);
  });

  it('CA-10 (RN-5): las carpetas siguen sin tamaño: «—» con texto para lectores de pantalla', () => {
    renderTable(sortingWith({ sort: 'size', dir: 'desc' }));

    expect(screen.getByText('Carpeta, sin tamaño')).toBeTruthy();
  });

  it('sin control de orden los encabezados son texto y no llevan aria-sort', () => {
    renderTable();

    expect(within(header('Nombre')).queryByRole('button')).toBeNull();
    expect(document.querySelectorAll('th[aria-sort]')).toHaveLength(0);
  });
});
