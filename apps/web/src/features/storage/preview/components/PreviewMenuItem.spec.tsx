/** @jest-environment jsdom */
import type { FileKind, FileSummary } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { MyFiles } from '../..';
import { FileRowMenu } from '../../components/file-row-menu';
import * as api from '../api';
import { previewPathOf } from '../routes';

import { PreviewFiles, PreviewMenuItem } from './PreviewMenuItem';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../..', () => ({ ...jest.requireActual('../..'), MyFiles: jest.fn(() => null) }));
jest.mock('../api', () => ({ ...jest.requireActual('../api'), requestPreviewUrl: jest.fn() }));

const file = (kind: FileKind): FileSummary => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Archivo.docx',
  kind,
  folderId: null,
  sizeBytes: 100,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
});

async function openMenu(kind: FileKind) {
  const selected = file(kind);
  const requestUrl = jest.fn();
  const { container } = render(
    <FileRowMenu
      file={selected}
      requestUrl={requestUrl}
      onNotice={jest.fn()}
      onRefresh={jest.fn()}
      onRename={jest.fn()}
      onMove={jest.fn()}
      onMoveToTrash={jest.fn()}
      pin={{ pinned: false, onToggle: jest.fn() }}
      firstAction={<PreviewMenuItem file={selected} />}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Acciones de Archivo.docx' }));
  return { container, requestUrl };
}

describe('menú T-06 sobre firstAction real de T-05', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['pdf', 'texto', 'imagen', 'xlsx', 'pptx'] as const)(
    'CA-6: %s muestra Previsualizar primero aunque el nombre termine en docx',
    async (kind) => {
      await openMenu(kind);
      expect(screen.getAllByRole('menuitem')[0]?.textContent).toBe('Previsualizar');
      expect(screen.getByRole('menuitem', { name: 'Descargar' })).toBeTruthy();
    },
  );

  it.each(['docx', 'otro'] as const)(
    'CA-6: %s conserva Descargar primero sin vista previa',
    async (kind) => {
      await openMenu(kind);
      expect(screen.queryByRole('menuitem', { name: 'Previsualizar' })).toBeNull();
      expect(screen.getAllByRole('menuitem')[0]?.textContent).toBe('Descargar');
    },
  );

  it('CA-9: el teclado navega por la ruta aprobada sin iniciar la descarga', async () => {
    const { requestUrl } = await openMenu('pdf');
    act(() => screen.getByRole('menuitem', { name: 'Previsualizar' }).focus());
    await userEvent.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith(previewPathOf(file('pdf').id));
    expect(requestUrl).toHaveBeenCalledTimes(0);
  });

  it('CA-7: el wrapper cliente conecta solo props públicas y firstAction', () => {
    render(<PreviewFiles folderId={null} returnFocusId="archivo-17" />);
    expect(MyFiles).toHaveBeenCalledWith(
      { folderId: null, returnFocusId: 'archivo-17', firstAction: PreviewMenuItem },
      undefined,
    );
  });

  it('Guardia transversal: abrir el menú no emite una URL de preview anticipadamente', async () => {
    await openMenu('pdf');
    expect(api.requestPreviewUrl).toHaveBeenCalledTimes(0);
  });

  it('CA-9: el menú abierto no presenta violaciones de jest-axe', async () => {
    await openMenu('pdf');
    expect((await axe(screen.getByRole('menu'))).violations).toEqual([]);
  });
});
