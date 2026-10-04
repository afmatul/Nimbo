/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FolderContentsResponse,
  type FolderRef,
  type FolderSummary,
  type NodeSummary,
} from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { StorageApi } from '../api';
import { StorageRequestError } from '../storage-request-error';

import { MyFiles } from './my-files';
import { UploadsProvider } from './uploads-provider';

jest.mock('../../identity/components/sign-out-button', () => ({ SignOutButton: () => null }));

const AT = '2026-09-30T10:00:00.000Z';
const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3' };
const NOTAS: FolderRef = { id: '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a', name: 'Notas' };

const folderSummary = (ref: FolderRef, parentId: string | null): FolderSummary => ({
  ...ref,
  parentId,
  createdAt: AT,
});
const folder = (ref: FolderRef, parentId: string | null): NodeSummary => ({
  type: 'folder',
  ...folderSummary(ref, parentId),
});
const file = (id: string, name: string, folderId: string | null): NodeSummary => ({
  type: 'file',
  id,
  name,
  sizeBytes: 1_500,
  kind: 'pdf',
  folderId,
  createdAt: AT,
});

const LISTINGS: Readonly<Record<string, FolderContentsResponse>> = {
  root: {
    folder: null,
    breadcrumbs: [],
    items: [folder(ALPHA, null), file('f-root', 'raiz.pdf', null)],
    nextCursor: null,
  },
  [ALPHA.id]: {
    folder: ALPHA,
    breadcrumbs: [ALPHA],
    items: [folder(FASE3, ALPHA.id), folder(NOTAS, ALPHA.id), file('f-a', 'acta.pdf', ALPHA.id)],
    nextCursor: null,
  },
};

function fakeApi(overrides: Partial<StorageApi> = {}): StorageApi {
  const pending = (): Promise<never> => new Promise(() => undefined);
  return {
    init: jest.fn(pending),
    resume: jest.fn(pending),
    complete: jest.fn(pending),
    cancel: jest.fn(pending),
    downloadUrl: jest.fn(pending),
    renameFile: jest.fn(pending),
    moveFile: jest.fn(pending),
    createFolder: jest.fn(pending),
    renameFolder: jest.fn(pending),
    moveFolder: jest.fn(pending),
    listTrash: jest.fn(pending),
    restore: jest.fn(pending),
    purge: jest.fn(pending),
    emptyTrash: jest.fn(pending),
    trashSummary: jest.fn(() => Promise.resolve({ itemCount: 0 })),
    moveToTrash: jest.fn(pending),
    folderContents: jest.fn((folderId: string | null) =>
      Promise.resolve(LISTINGS[folderId ?? 'root'] as FolderContentsResponse),
    ),
    ...overrides,
  } as StorageApi;
}

async function renderMyFilesWithAlphaExpanded(api: StorageApi): Promise<void> {
  render(
    <UploadsProvider api={api}>
      <MyFiles folderId={null} />
    </UploadsProvider>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Mostrar contenido de Proyecto Alpha' }),
  );
  await screen.findByText('acta.pdf');
}

async function chooseRowAction(name: string, action: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Acciones de ${name}` }));
  await userEvent.click(screen.getByRole('menuitem', { name: action }));
}

describe('MyFiles con carpetas desglosadas (006 CA-26)', () => {
  it('CA-26: mover a la papelera desde un subnivel quita el elemento de ese nivel y deja el resto', async () => {
    const api = fakeApi({ moveToTrash: jest.fn(() => Promise.resolve({} as never)) });
    await renderMyFilesWithAlphaExpanded(api);

    await chooseRowAction('acta.pdf', 'Mover a la papelera');

    expect(api.moveToTrash).toHaveBeenCalledWith('file', 'f-a');
    expect(screen.queryByText('acta.pdf')).toBeNull();
    expect(screen.getByText('Fase 3')).toBeTruthy();
    expect(screen.getByText('raiz.pdf')).toBeTruthy();
  });

  it('CA-26: renombrar una subcarpeta actualiza su nivel', async () => {
    const api = fakeApi({
      renameFolder: jest.fn(() =>
        Promise.resolve(folderSummary({ id: FASE3.id, name: 'Fase 4' }, ALPHA.id)),
      ),
    });
    await renderMyFilesWithAlphaExpanded(api);

    await chooseRowAction('Fase 3', 'Renombrar');
    const field = screen.getByRole('textbox');
    await userEvent.clear(field);
    await userEvent.type(field, 'Fase 4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(api.renameFolder).toHaveBeenCalledWith(FASE3.id, { name: 'Fase 4' });
    expect(await screen.findByRole('button', { name: 'Mostrar contenido de Fase 4' })).toBeTruthy();
    expect(screen.queryByText('Fase 3')).toBeNull();
  });

  it('CA-26: el nombre repetido de una subcarpeta se explica con sus hermanas de ese nivel', async () => {
    const api = fakeApi({
      renameFolder: jest.fn(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      ),
    });
    await renderMyFilesWithAlphaExpanded(api);

    await chooseRowAction('Fase 3', 'Renombrar');
    const field = screen.getByRole('textbox');
    await userEvent.clear(field);
    await userEvent.type(field, 'notas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(
      await screen.findByText('Ya existe una carpeta llamada «Notas» aquí. Elige otro nombre.'),
    ).toBeTruthy();
  });
});
