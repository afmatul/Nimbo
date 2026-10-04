/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type NodeSummary, type TrashItem } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { Toaster } from '../../../components/ui/sonner';
import type { DownloadNotice } from '../components/file-row-menu';
import { StorageRequestError } from '../storage-request-error';
import type { TrashApi } from '../trash-api';

import { useMoveToTrash } from './use-move-to-trash';

const AT = '2026-09-30T10:00:00.000Z';
const FILE: NodeSummary = {
  type: 'file',
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'Resultados_evaluacion.xlsx',
  sizeBytes: 1_000,
  kind: 'xlsx',
  folderId: null,
  createdAt: AT,
};
const FOLDER: NodeSummary = {
  type: 'folder',
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  name: 'Fase 3',
  parentId: null,
  createdAt: AT,
};
const ITEM: TrashItem = {
  id: FILE.id,
  type: 'file',
  name: FILE.name,
  sizeBytes: 1_000,
  originalFolder: null,
  deletedAt: AT,
  purgeAt: AT,
};

interface HarnessProps {
  readonly moveToTrash: TrashApi['moveToTrash'];
  readonly node: NodeSummary;
  readonly onMoved?: () => void;
  readonly onNotice?: (notice: DownloadNotice | null) => void;
  readonly onRefresh?: () => void;
}

function Harness({
  moveToTrash,
  node,
  onMoved = jest.fn(),
  onNotice = jest.fn(),
  onRefresh = jest.fn(),
}: HarnessProps): React.JSX.Element {
  const trash = useMoveToTrash({ api: { moveToTrash }, onMoved, onNotice, onRefresh });
  return (
    <>
      <button type="button" onClick={() => void trash.moveToTrash(node)}>
        Mover
      </button>
      <output>{[...trash.trashedIds].join(',')}</output>
      <Toaster />
    </>
  );
}

afterEach(async () => {
  await act(async () => {
    toast.dismiss();
  });
});

describe('useMoveToTrash (CA-10, CA-11)', () => {
  it('CA-10: sin confirmación, lo saca de la vista y avisa «Movimos…» con «Ver papelera»', async () => {
    const moveToTrash = jest.fn(() => Promise.resolve(ITEM));
    const onMoved = jest.fn();
    render(<Harness moveToTrash={moveToTrash} node={FILE} onMoved={onMoved} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));

    expect(moveToTrash).toHaveBeenCalledWith('file', FILE.id);
    expect(screen.getByRole('status', { name: 'Avisos' }).textContent).toContain(
      'Movimos «Resultados_evaluacion.xlsx» a la papelera.',
    );
    expect(screen.getByRole('link', { name: 'Ver papelera' }).getAttribute('href')).toBe(
      '/papelera',
    );
    expect(screen.getByRole('status', { name: '' }).textContent).toBe(FILE.id);
    expect(onMoved).toHaveBeenCalled();
  });

  it('CA-11: una carpeta va por su ruta', async () => {
    const moveToTrash = jest.fn(() =>
      Promise.resolve({ ...ITEM, id: FOLDER.id, type: 'folder' as const }),
    );
    render(<Harness moveToTrash={moveToTrash} node={FOLDER} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));

    expect(moveToTrash).toHaveBeenCalledWith('folder', FOLDER.id);
    expect(await screen.findByText('Movimos «Fase 3» a la papelera.')).toBeTruthy();
  });

  it('CA-10: si falla, avisa arriba de la lista con «Reintentar» y el elemento se queda', async () => {
    const moveToTrash = jest
      .fn<Promise<TrashItem>, [TrashItem['type'], string]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ITEM);
    const onNotice = jest.fn();
    render(<Harness moveToTrash={moveToTrash} node={FILE} onNotice={onNotice} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));

    const notice = onNotice.mock.calls.at(-1)?.[0] as DownloadNotice;
    expect(notice).toMatchObject({
      title: 'No pudimos mover «Resultados_evaluacion.xlsx» a la papelera.',
      description: 'Revisa tu conexión e inténtalo de nuevo. El archivo sigue en esta carpeta.',
      actionLabel: 'Reintentar',
    });
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('');
    await act(async () => notice.onAction());
    expect(moveToTrash).toHaveBeenCalledTimes(2);
  });

  it('CA-16: un 404 pide actualizar la lista', async () => {
    const onRefresh = jest.fn();
    const onNotice = jest.fn();
    const moveToTrash = jest.fn(() =>
      Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
    );
    render(
      <Harness moveToTrash={moveToTrash} node={FILE} onNotice={onNotice} onRefresh={onRefresh} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mover' }));

    const notice = onNotice.mock.calls.at(-1)?.[0] as DownloadNotice;
    expect(notice).toMatchObject({
      title: 'No encontramos «Resultados_evaluacion.xlsx».',
      actionLabel: 'Actualizar lista',
    });
    notice.onAction();
    expect(onRefresh).toHaveBeenCalled();
  });
});
