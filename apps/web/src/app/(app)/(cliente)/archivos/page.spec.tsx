/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FileSummary,
  type FolderContentsResponse,
  type InitUploadResponse,
  type ResumeUploadResponse,
} from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SessionProvider } from '../../../../features/identity/session/session-provider';
import type { StorageApi } from '../../../../features/storage/api';
import { UploadsSpaceProvider } from '../../../../features/storage/components/space-provider';
import { UploadsProvider } from '../../../../features/storage/components/uploads-provider';
import { StorageRequestError } from '../../../../features/storage/storage-request-error';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';
import type { UploadManagerOptions } from '../../../../features/storage/upload/upload-manager';

import ArchivosPage from './page';

const AT = '2026-09-30T10:00:00.000Z';
const UPLOAD_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const INFORME: FileSummary = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'informe.docx',
  sizeBytes: 1_500,
  kind: 'docx',
  folderId: null,
  createdAt: AT,
  updatedAt: AT,
};
const NUEVO: FileSummary = {
  ...INFORME,
  id: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b2f0c1d2e',
  name: 'nuevo.pdf',
};

function page(items: readonly FileSummary[]): FolderContentsResponse {
  return {
    folder: null,
    breadcrumbs: [],
    items: items.map((file) => ({ type: 'file', ...file })),
    nextCursor: null,
    accessLevel: 'OWNER',
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function fakeApi(overrides: Partial<StorageApi> = {}): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => never<InitUploadResponse>()),
    resume: jest.fn(() => never<ResumeUploadResponse>()),
    complete: jest.fn(() => Promise.resolve({ file: NUEVO })),
    cancel: jest.fn(() => Promise.resolve()),
    folderContents: jest.fn(() => Promise.resolve(page([]))),
    createFolder: jest.fn(() => never()),
    downloadUrl: jest.fn(() => never()),
    trashSummary: jest.fn(() =>
      Promise.resolve({ itemCount: 0, totalBytes: 0, retentionDays: 60 }),
    ),
    moveToTrash: jest.fn(() => never()),
    quickAccess: jest.fn(() => Promise.resolve({ pinned: [], recent: [], hasMoreRecent: false })),
    recordRecent: jest.fn(() => Promise.resolve()),
    spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))),
    ...overrides,
  } as jest.Mocked<StorageApi>;
}

async function renderPage(
  api: StorageApi,
  managerOptions?: UploadManagerOptions,
): Promise<HTMLElement> {
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <UploadsProvider api={api} {...(managerOptions ? { managerOptions } : {})}>
        <UploadsSpaceProvider>
          <ArchivosPage />
        </UploadsSpaceProvider>
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

async function chooseFiles(files: readonly File[]): Promise<void> {
  const input = screen.getByLabelText<HTMLInputElement>('Elegir archivos para subir');
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

describe('página Mis archivos (/archivos)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
  });

  it('CA-1: sustituye el marcador; sin archivos muestra el vacío y «Subir archivos»', async () => {
    const api = fakeApi();
    await renderPage(api);

    expect(await screen.findByText('Aún no tienes archivos')).toBeTruthy();
    expect(screen.queryByText('Tus archivos aparecerán aquí')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Mis archivos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(api.folderContents).toHaveBeenCalledWith(null, { sort: 'created', dir: 'desc' });
  });

  it('CA-1: lista la raíz con el menú «Acciones de {nombre}» en cada fila', async () => {
    await renderPage(fakeApi({ folderContents: jest.fn(() => Promise.resolve(page([INFORME]))) }));

    const table = await screen.findByRole('table');
    expect(within(table).getByText('informe.docx')).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Acciones de informe.docx' })).toBeTruthy();
  });

  it('CA-21: si el listado falla, «Reintentar» repite la petición y muestra la lista', async () => {
    const folderContents = jest
      .fn<Promise<FolderContentsResponse>, [string | null]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(page([INFORME]));
    await renderPage(fakeApi({ folderContents }));

    expect(await screen.findByText('No pudimos cargar tus archivos.')).toBeTruthy();
    expect(screen.queryByText(/soporte/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(folderContents).toHaveBeenCalledTimes(2);
    expect(folderContents).toHaveBeenLastCalledWith(null, { sort: 'created', dir: 'desc' });
  });

  it('CA-1, CA-21: con el listado caído, «Subir archivos» sigue habilitado y el panel sigue vivo', async () => {
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.reject(new StorageRequestError(503, 'INTERNAL_ERROR'))),
    });
    await renderPage(api);
    await screen.findByText('No pudimos cargar tus archivos.');

    const upload = screen.getAllByRole('button', { name: 'Subir archivos' })[0];
    expect(upload?.hasAttribute('disabled')).toBe(false);
    await chooseFiles([new File(['hola'], 'nuevo.pdf')]);

    expect(await screen.findByRole('region', { name: 'Subiendo 1 archivo' })).toBeTruthy();
    expect(api.init).toHaveBeenCalledWith({
      name: 'nuevo.pdf',
      sizeBytes: 4,
      onConflict: 'ask',
      folderId: null,
    });
    expect(screen.getByText('No pudimos cargar tus archivos.')).toBeTruthy();
  });

  it('CA-1: soltar archivos en la página los encola en el manager', async () => {
    const api = fakeApi();
    await renderPage(api);
    await screen.findByText('Aún no tienes archivos');

    const zone = screen.getByTestId('upload-dropzone');
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [new File(['hola'], 'nuevo.pdf')] } });
    });

    await waitFor(() =>
      expect(api.init).toHaveBeenCalledWith({
        name: 'nuevo.pdf',
        sizeBytes: 4,
        onConflict: 'ask',
        folderId: null,
      }),
    );
  });

  it('CA-1 (UI-1): soltar un archivo fuera de la zona, sobre el encabezado, no lo abre el navegador', async () => {
    const api = fakeApi();
    await renderPage(api);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mis archivos' });
    const files = { files: [new File(['hola'], 'nuevo.pdf')], types: ['Files'] };

    const over = fireEvent.dragOver(heading, { dataTransfer: files });
    const drop = fireEvent.drop(heading, { dataTransfer: files });

    expect(over).toBe(false);
    expect(drop).toBe(false);
    expect(api.init).not.toHaveBeenCalled();
  });

  it('CA-1 (UI-1): un arrastre que no trae archivos (texto) no se intercepta', async () => {
    await renderPage(fakeApi());
    const heading = await screen.findByRole('heading', { level: 1, name: 'Mis archivos' });

    expect(fireEvent.drop(heading, { dataTransfer: { types: ['text/plain'] } })).toBe(true);
  });

  it('CA-1, 007 CA-4: un archivo recién subido aparece en la lista sin recargar y refresca el espacio', async () => {
    const simple: InitUploadResponse = {
      uploadId: UPLOAD_ID,
      mode: 'simple',
      name: 'nuevo.pdf',
      expiresAt: AT,
      upload: { url: 'https://s3.nimbo.test/u/a', method: 'PUT', expiresAt: AT },
    };
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
      init: jest.fn(() => Promise.resolve(simple)),
    });
    await renderPage(api, { put: () => Promise.resolve() });
    await screen.findByRole('table');

    await chooseFiles([new File(['hola'], 'nuevo.pdf')]);

    const table = screen.getByRole('table');
    await waitFor(() =>
      expect(
        within(table)
          .getAllByRole('row')
          .slice(1)
          .map((row) => row.textContent),
      ).toEqual([expect.stringContaining('nuevo.pdf'), expect.stringContaining('informe.docx')]),
    );
    expect(api.folderContents).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.spaceSummary).toHaveBeenCalledTimes(2));
  });

  it('CA-13: si la descarga falla con 404, el aviso va arriba de la lista y la fila se queda', async () => {
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
      downloadUrl: jest.fn(() =>
        Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
      ),
    });
    await renderPage(api);
    const trigger = await screen.findByRole('button', { name: 'Acciones de informe.docx' });

    trigger.focus();
    await act(async () => {
      fireEvent.keyDown(trigger, { key: 'Enter' });
    });
    await act(async () => {
      screen.getByRole('menuitem', { name: 'Descargar' }).click();
    });

    expect(api.downloadUrl).toHaveBeenCalledWith(INFORME.id);
    expect(await screen.findByText('No encontramos «informe.docx».')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('informe.docx')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }));
    await waitFor(() => expect(api.folderContents).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('No encontramos «informe.docx».')).toBeNull();
  });

  it('006 CA-1: «Nueva carpeta» en la raíz la crea y la lista primero, sin volver a pedir la raíz', async () => {
    const created = {
      id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      name: 'Actas',
      parentId: null,
      createdAt: AT,
      updatedAt: AT,
    };
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
      createFolder: jest.fn(() => Promise.resolve(created)),
    });
    await renderPage(api);
    await screen.findByRole('table');
    expect(screen.getByText('Mis archivos', { selector: '[aria-current="page"]' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Nueva carpeta' }));
    expect(screen.getByRole('dialog').textContent).toContain('Se creará en Mis archivos.');
    await userEvent.type(screen.getByLabelText('Nombre de la carpeta'), 'Actas');
    await userEvent.click(screen.getByRole('button', { name: 'Crear carpeta' }));

    expect(api.createFolder).toHaveBeenCalledWith({ name: 'Actas', parentId: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [first] = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(first?.textContent).toContain('Actas');
    expect(api.folderContents).toHaveBeenCalledTimes(1);
  });

  it('006 CA-10: «Mover a la papelera» quita la fila sin confirmar, avisa y sube el contador', async () => {
    const trashSummary = jest
      .fn()
      .mockResolvedValueOnce({ itemCount: 0, totalBytes: 0, retentionDays: 60 })
      .mockResolvedValue({ itemCount: 1, totalBytes: 1_500, retentionDays: 60 });
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
      trashSummary,
      moveToTrash: jest.fn(() =>
        Promise.resolve({
          id: INFORME.id,
          type: 'file' as const,
          name: INFORME.name,
          sizeBytes: INFORME.sizeBytes,
          originalFolder: null,
          deletedAt: AT,
          purgeAt: AT,
        }),
      ),
    });
    await renderPage(api);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de informe.docx' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mover a la papelera' }));

    expect(api.moveToTrash).toHaveBeenCalledWith('file', INFORME.id);
    expect(await screen.findByText('Movimos «informe.docx» a la papelera.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver papelera' }).getAttribute('href')).toBe(
      '/papelera',
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    await waitFor(() =>
      expect(within(sidebar).getByRole('link', { name: 'Papelera (1 elemento)' })).toBeTruthy(),
    );
  });

  it('007 CA-4: mandar algo a la papelera vuelve a pedir el resumen de espacio', async () => {
    const api = fakeApi({
      folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
      moveToTrash: jest.fn(() =>
        Promise.resolve({
          id: INFORME.id,
          type: 'file' as const,
          name: INFORME.name,
          sizeBytes: INFORME.sizeBytes,
          originalFolder: null,
          deletedAt: AT,
          purgeAt: AT,
        }),
      ),
    });
    await renderPage(api);
    await screen.findByRole('table');
    expect(api.spaceSummary).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de informe.docx' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mover a la papelera' }));

    await waitFor(() => expect(api.spaceSummary).toHaveBeenCalledTimes(2));
  });

  it('007 CA-6: el vacío y la zona de arrastre usan el máximo por archivo del resumen', async () => {
    await renderPage(fakeApi());

    expect(await screen.findByText(/Tu plan permite hasta 50 MB por archivo\./u)).toBeTruthy();
  });

  it('007 CA-5: la barra lateral muestra la tarjeta de cuota con «Ver detalle» hacia /espacio', async () => {
    await renderPage(fakeApi());

    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    const quota = within(sidebar).getByRole('region', { name: 'Almacenamiento' });
    expect(within(quota).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('32');
    expect(within(quota).getByRole('link', { name: 'Ver detalle' }).getAttribute('href')).toBe(
      '/espacio',
    );
  });

  it('007 CA-8: si el resumen falla, la lista y «Subir archivos» siguen usables', async () => {
    await renderPage(
      fakeApi({
        folderContents: jest.fn(() => Promise.resolve(page([INFORME]))),
        spaceSummary: jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
      }),
    );

    expect(await screen.findByRole('table')).toBeTruthy();
    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('region', { name: 'Almacenamiento' }).textContent).toContain(
      'No pudimos calcular tu espacio.',
    );
    expect(screen.getByRole('button', { name: 'Subir archivos' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.queryByText(/Tu plan permite hasta/u)).toBeNull();
  });

  it('CA-21: la lista no tiene violaciones de accesibilidad', async () => {
    const container = await renderPage(
      fakeApi({ folderContents: jest.fn(() => Promise.resolve(page([INFORME]))) }),
    );
    await screen.findByRole('table');

    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
