/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FileSummary,
  type FolderContentsResponse,
  type FolderRef,
  type FolderSummary,
  type InitUploadResponse,
  type ResumeUploadResponse,
} from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider } from '../../../../../../features/identity/session/session-provider';
import type { StorageApi } from '../../../../../../features/storage/api';
import { UploadsProvider } from '../../../../../../features/storage/components/uploads-provider';
import { StorageRequestError } from '../../../../../../features/storage/storage-request-error';
import type { UploadManagerOptions } from '../../../../../../features/storage/upload/upload-manager';

import CarpetaPage from './page';

const AT = '2026-09-30T10:00:00.000Z';
const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };
const FINANZAS: FolderRef = { id: '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a', name: 'Finanzas' };
const PROMPTS: FolderSummary = {
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Prompts',
  parentId: FASE3.id,
  createdAt: AT,
};
const INFORME: FileSummary = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'Informe_avance_RAG.docx',
  sizeBytes: 1_200_000,
  kind: 'docx',
  folderId: FASE3.id,
  createdAt: AT,
};

const ROOT: FolderContentsResponse = {
  folder: null,
  breadcrumbs: [],
  items: [
    { type: 'folder', ...ALPHA, parentId: null, createdAt: AT },
    { type: 'folder', ...FINANZAS, parentId: null, createdAt: AT },
  ],
  nextCursor: null,
};

function fase3(items: FolderContentsResponse['items']): FolderContentsResponse {
  return { folder: FASE3, breadcrumbs: [ALPHA, FASE3], items, nextCursor: null };
}

const FASE3_CONTENTS = fase3([
  { type: 'folder', ...PROMPTS },
  { type: 'file', ...INFORME },
]);

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function contentsBy(
  byFolder: (folderId: string | null) => Promise<FolderContentsResponse>,
): jest.Mock<Promise<FolderContentsResponse>, [string | null]> {
  return jest.fn(byFolder);
}

function fakeApi(overrides: Partial<StorageApi> = {}): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => never<InitUploadResponse>()),
    resume: jest.fn(() => never<ResumeUploadResponse>()),
    complete: jest.fn(() => never()),
    cancel: jest.fn(() => Promise.resolve()),
    folderContents: contentsBy((folderId) =>
      Promise.resolve(folderId === null ? ROOT : FASE3_CONTENTS),
    ),
    createFolder: jest.fn(() => never<FolderSummary>()),
    downloadUrl: jest.fn(() => never()),
    ...overrides,
  } as jest.Mocked<StorageApi>;
}

async function renderFolder(
  api: StorageApi,
  folderId = FASE3.id,
  managerOptions?: UploadManagerOptions,
): Promise<void> {
  const page = await CarpetaPage({ params: Promise.resolve({ folderId }) });
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <UploadsProvider api={api} {...(managerOptions ? { managerOptions } : {})}>
        {page}
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

async function chooseFiles(files: readonly File[]): Promise<void> {
  const input = screen.getByLabelText<HTMLInputElement>('Elegir archivos para subir');
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

describe('página de una carpeta (/archivos/carpeta/[folderId])', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
  });

  it('CA-5: lista la carpeta de la URL: título, carpetas primero y migas en la barra superior', async () => {
    const api = fakeApi();
    await renderFolder(api);

    expect(await screen.findByRole('heading', { level: 1, name: 'Fase 3 · RAG' })).toBeTruthy();
    expect(api.folderContents).toHaveBeenCalledWith(FASE3.id);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Prompts'),
      expect.stringContaining('Informe_avance_RAG.docx'),
    ]);
    const crumbs = within(screen.getByRole('navigation', { name: 'Ruta' }));
    expect(crumbs.getByRole('link', { name: 'Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(crumbs.getByRole('link', { name: 'Proyecto Alpha' })).toBeTruthy();
  });

  it('CA-5: la barra lateral muestra solo las carpetas de primer nivel, sin cantidades', async () => {
    const api = fakeApi();
    await renderFolder(api);

    const sidebar = await screen.findByRole('complementary', {
      name: 'Barra lateral de escritorio',
    });
    await waitFor(() => expect(within(sidebar).getByText('Finanzas')).toBeTruthy());
    expect(within(sidebar).getByText('Carpetas')).toBeTruthy();
    expect(within(sidebar).getByRole('link', { name: 'Proyecto Alpha' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${ALPHA.id}`,
    );
    expect(within(sidebar).getByRole('link', { name: 'Papelera' }).getAttribute('href')).toBe(
      '/papelera',
    );
    expect(api.folderContents).toHaveBeenCalledWith(null);
  });

  it('CA-5: carpeta ajena, inexistente o en la papelera: «No encontramos esta carpeta»', async () => {
    await renderFolder(
      fakeApi({
        folderContents: contentsBy((folderId) =>
          folderId === null
            ? Promise.resolve(ROOT)
            : Promise.reject(
                new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND),
              ),
        ),
      }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No encontramos esta carpeta' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(screen.getByRole('link', { name: 'Ver papelera' }).getAttribute('href')).toBe(
      '/papelera',
    );
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('CA-5: si el listado falla, «Reintentar» vuelve a pedir la misma carpeta', async () => {
    let fails = true;
    const folderContents = contentsBy((folderId) => {
      if (folderId === null) return Promise.resolve(ROOT);
      if (fails) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(FASE3_CONTENTS);
    });
    await renderFolder(fakeApi({ folderContents }));

    expect(await screen.findByText('No pudimos abrir esta carpeta.')).toBeTruthy();
    fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('CA-6: lo que se elige se sube a la carpeta abierta', async () => {
    const api = fakeApi();
    await renderFolder(api);
    await screen.findByRole('table');

    await chooseFiles([new File(['hola'], 'nuevo.pdf')]);

    await waitFor(() =>
      expect(api.init).toHaveBeenCalledWith({
        name: 'nuevo.pdf',
        sizeBytes: 4,
        onConflict: 'ask',
        folderId: FASE3.id,
      }),
    );
  });

  it('CA-6: el archivo recién subido aparece en su carpeta, después de las subcarpetas', async () => {
    const uploaded: FileSummary = {
      ...INFORME,
      id: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b2f0c1d2e',
      name: 'nuevo.pdf',
      kind: 'pdf',
    };
    const simple: InitUploadResponse = {
      uploadId: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      mode: 'simple',
      name: 'nuevo.pdf',
      expiresAt: AT,
      upload: { url: 'https://s3.nimbo.test/u/a', method: 'PUT', expiresAt: AT },
    };
    const api = fakeApi({
      init: jest.fn(() => Promise.resolve(simple)),
      complete: jest.fn(() => Promise.resolve({ file: uploaded })),
    });
    await renderFolder(api, FASE3.id, { put: () => Promise.resolve() });
    await screen.findByRole('table');

    await chooseFiles([new File(['hola'], 'nuevo.pdf')]);

    await waitFor(() =>
      expect(
        within(screen.getByRole('table'))
          .getAllByRole('row')
          .slice(1)
          .map((row) => row.textContent),
      ).toEqual([
        expect.stringContaining('Prompts'),
        expect.stringContaining('nuevo.pdf'),
        expect.stringContaining('Informe_avance_RAG.docx'),
      ]),
    );
  });

  it('CA-1: «Nueva carpeta» crea dentro de la carpeta abierta y la muestra primero', async () => {
    const created: FolderSummary = {
      id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      name: 'Resultados finales',
      parentId: FASE3.id,
      createdAt: AT,
    };
    const api = fakeApi({ createFolder: jest.fn(() => Promise.resolve(created)) });
    await renderFolder(api);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva carpeta' });
    expect(dialog.textContent).toContain('Se creará en Fase 3 · RAG.');
    await userEvent.type(
      within(dialog).getByLabelText('Nombre de la carpeta'),
      'Resultados finales',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear carpeta' }));

    expect(api.createFolder).toHaveBeenCalledWith({
      name: 'Resultados finales',
      parentId: FASE3.id,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [first] = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(first?.textContent).toContain('Resultados finales');
    expect(api.folderContents).toHaveBeenCalledTimes(2);
  });

  it('CA-3: el 409 dice el nombre de la carpeta como está guardado', async () => {
    const api = fakeApi({
      createFolder: jest.fn(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      ),
    });
    await renderFolder(api);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    await userEvent.type(screen.getByLabelText('Nombre de la carpeta'), 'prompts');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(
      await screen.findByText('Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.'),
    ).toBeTruthy();
  });
});
