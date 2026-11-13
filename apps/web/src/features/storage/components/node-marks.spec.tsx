/**
 * @jest-environment jsdom
 */
import type { ExplorerNode, NodeSummary } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';

import { NodeMarks } from './node-marks';

const AT = '2026-11-01T10:00:00.000Z';
const FILE: NodeSummary = {
  type: 'file',
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'Acta.docx',
  sizeBytes: 1_000,
  kind: 'docx',
  folderId: null,
  createdAt: AT,
  updatedAt: AT,
};
const FOLDER: NodeSummary = {
  type: 'folder',
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  name: 'Actas',
  parentId: null,
  createdAt: AT,
  updatedAt: AT,
};

const fileWith = (marks: Pick<Extract<ExplorerNode, { type: 'file' }>, 'shared' | 'indexStatus'>) =>
  ({ ...FILE, ...marks }) as NodeSummary;

describe('NodeMarks: estado de indexación y «compartido» en el explorador', () => {
  it.each([
    ['pending', 'Indexando…'],
    ['processing', 'Indexando…'],
    ['indexed', 'Indexado'],
    ['failed', 'No se pudo indexar'],
    ['unsupported', 'No se indexa'],
  ] as const)('un archivo %s dice «%s» con texto (no solo color)', (indexStatus, label) => {
    render(<NodeMarks node={fileWith({ shared: false, indexStatus })} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('Estado de indexación:')).toBeTruthy();
    expect(screen.queryByText('Compartido')).toBeNull();
  });

  it('un archivo compartido lleva «Compartido»; una carpeta compartida, «Compartida» y sin indexación', () => {
    const { rerender } = render(
      <NodeMarks node={fileWith({ shared: true, indexStatus: 'indexed' })} />,
    );
    expect(screen.getByText('Compartido')).toBeTruthy();

    rerender(<NodeMarks node={{ ...FOLDER, shared: true } as NodeSummary} />);
    expect(screen.getByText('Compartida')).toBeTruthy();
    expect(screen.queryByText(/Indexa/)).toBeNull();
  });

  it('sin marcas (p. ej. lo recién subido en esta pestaña) no pinta nada', () => {
    const { container } = render(<NodeMarks node={FOLDER} />);

    expect(container.textContent).toBe('');
  });
});
