/**
 * @jest-environment jsdom
 */
import type { NodeSummary } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';

import { NodeCards } from './node-cards';

const NOW = '2026-11-10T10:00:00.000Z';
const FOLDER = {
  type: 'folder',
  id: 'f1',
  name: 'Finanzas',
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as NodeSummary;
const PDF = {
  type: 'file',
  id: 'a1',
  name: 'modelo.pdf',
  kind: 'pdf',
  sizeBytes: '1048576',
  updatedAt: NOW,
} as unknown as NodeSummary;
const OTHER = { ...PDF, id: 'a2', name: 'datos.bin', kind: 'otro' } as unknown as NodeSummary;

function renderCards(nodes: readonly NodeSummary[]): void {
  render(
    <NodeCards
      nodes={nodes}
      placeName="Mis archivos"
      renderRowActions={(node) => <button type="button">{`Acciones de ${node.name}`}</button>}
    />,
  );
}

describe('NodeCards', () => {
  it('muestra las carpetas arriba, en su sección, y enlazan a su página', () => {
    renderCards([FOLDER, PDF]);
    const sections = screen.getAllByRole('region');
    expect(sections.map((section) => within(section).getByRole('heading').textContent)).toEqual([
      'Carpetas',
      'Archivos',
    ]);
    expect(screen.getByRole('link', { name: 'Finanzas' }).getAttribute('href')).toContain('f1');
  });

  it('un archivo previsualizable enlaza a su vista previa; los demás no son enlace', () => {
    renderCards([PDF, OTHER]);
    expect(screen.getByRole('link', { name: /modelo\.pdf/ }).getAttribute('href')).toContain('a1');
    expect(screen.queryByRole('link', { name: /datos\.bin/ })).toBeNull();
  });

  it('cada tarjeta conserva su menú de acciones y el id de fila para devolver el foco', () => {
    renderCards([FOLDER, PDF]);
    expect(screen.getByRole('button', { name: 'Acciones de Finanzas' })).toBeTruthy();
    expect(document.getElementById('fila-a1')?.querySelector('button')).toBeTruthy();
  });

  it('sin carpetas no muestra la sección «Carpetas»', () => {
    renderCards([PDF]);
    expect(screen.queryByRole('heading', { name: 'Carpetas' })).toBeNull();
  });
});
