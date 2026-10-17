/** @jest-environment jsdom */
import type { FileKind, FileSummary } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FileRowMenu } from '../../components/file-row-menu';
import * as api from '../api';
import { previewPathOf } from '../routes';

import { PreviewMenuItem } from './PreviewMenuItem';

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

function renderMenu(kind: FileKind) {
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
  return { container, requestUrl };
}

async function openMenu(kind: FileKind) {
  const rendered = renderMenu(kind);
  await userEvent.click(screen.getByRole('button', { name: 'Acciones de Archivo.docx' }));
  return rendered;
}

describe('menú T-06 sobre firstAction real de T-05', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['pdf', 'texto', 'imagen', 'xlsx', 'pptx'] as const)(
    'CA-6: %s muestra Previsualizar primero aunque el nombre termine en docx',
    async (kind) => {
      await openMenu(kind);
      expect(screen.getAllByRole('menuitem')[0]?.textContent).toBe('Previsualizar');
      const preview = screen.getByRole('menuitem', { name: 'Previsualizar' });
      expect(preview.tagName).toBe('A');
      expect(preview.getAttribute('href')).toBe(previewPathOf(file(kind).id));
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

  it.each([
    ['Enter', '{Enter}'],
    ['Espacio', ' '],
  ])(
    'CA-9: abre y recorre el menú con teclado y activa Previsualizar con %s',
    async (_name, key) => {
      const { requestUrl } = renderMenu('pdf');
      await userEvent.tab();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Acciones de Archivo.docx' }),
      );
      await userEvent.keyboard('{ArrowDown}');
      const preview = screen.getByRole('menuitem', { name: 'Previsualizar' });
      await waitFor(() => expect(document.activeElement).toBe(preview));
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Descargar' })),
      );
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(document.activeElement).toBe(preview));
      expect(api.requestPreviewUrl).toHaveBeenCalledTimes(0);
      const activate = jest.fn((event: MouseEvent) => event.preventDefault());
      document.addEventListener('click', activate, { once: true });
      try {
        await userEvent.keyboard(key);
      } finally {
        document.removeEventListener('click', activate);
      }
      expect(activate).toHaveBeenCalledTimes(1);
      expect(activate.mock.calls[0]?.[0].target).toBe(preview);
      expect(preview.getAttribute('href')).toBe(previewPathOf(file('pdf').id));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(requestUrl).toHaveBeenCalledTimes(0);
      expect(api.requestPreviewUrl).toHaveBeenCalledTimes(0);
    },
  );

  it('Guardia transversal: abrir el menú no emite una URL de preview anticipadamente', async () => {
    await openMenu('pdf');
    expect(api.requestPreviewUrl).toHaveBeenCalledTimes(0);
  });

  it('CA-9: el menú abierto no presenta violaciones de jest-axe', async () => {
    await openMenu('pdf');
    expect((await axe(screen.getByRole('menu'))).violations).toEqual([]);
  });
});
