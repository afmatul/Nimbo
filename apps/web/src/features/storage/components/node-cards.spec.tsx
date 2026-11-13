/**
 * @jest-environment jsdom
 */
import type { NodeSummary } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NodeCards } from './node-cards';
import { ThumbnailProvider } from './node-thumbnail';

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

  it('la vista rápida solo se ofrece en archivos previsualizables y avisa cuál se pidió', async () => {
    const onQuickLook = jest.fn();
    render(
      <NodeCards
        nodes={[PDF, OTHER]}
        placeName="Mis archivos"
        renderRowActions={undefined}
        onQuickLook={onQuickLook}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Vista rápida de datos.bin' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vista rápida de modelo.pdf' }));
    expect(onQuickLook).toHaveBeenCalledWith(PDF);
  });

  it('un .docx se abre en el editor: el nombre y el botón enlazan a él, sin vista rápida', () => {
    const docx = { ...PDF, id: 'd1', name: 'acta.docx', kind: 'docx' } as unknown as NodeSummary;
    render(
      <NodeCards
        nodes={[docx]}
        placeName="Mis archivos"
        renderRowActions={undefined}
        onQuickLook={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Abrir acta.docx en el editor' }).getAttribute('href'),
    ).toBe('/editor/d1');
    expect(screen.getByRole('link', { name: /abrir en el editor/ }).getAttribute('href')).toBe(
      '/editor/d1',
    );
    expect(screen.queryByRole('button', { name: /Vista rápida/ })).toBeNull();
  });

  it('con un renderizador de miniaturas, la tarjeta del archivo lo muestra sobre el ícono', () => {
    render(
      <ThumbnailProvider value={(file) => <span data-testid="miniatura">{file.name}</span>}>
        <NodeCards nodes={[PDF]} placeName="Mis archivos" renderRowActions={undefined} />
      </ThumbnailProvider>,
    );
    expect(
      within(screen.getByTestId('file-card-preview')).getByTestId('miniatura').textContent,
    ).toBe('modelo.pdf');
  });

  it('muestra las mismas marcas que la lista: indexación de cada archivo y «Compartido/a»', () => {
    const file = { ...PDF, shared: true, indexStatus: 'indexed' } as unknown as NodeSummary;
    const folder = { ...FOLDER, shared: true } as unknown as NodeSummary;
    renderCards([folder, file]);
    expect(screen.getByText('Indexado')).toBeTruthy();
    expect(screen.getByText('Compartido')).toBeTruthy();
    expect(screen.getByText('Compartida')).toBeTruthy();
  });

  it('sin marcas en el listado (recién creado en la pestaña) no dibuja nada extra', () => {
    renderCards([FOLDER, PDF]);
    expect(screen.queryByText('Indexado')).toBeNull();
    expect(screen.queryByText(/Compartid/)).toBeNull();
  });
});
