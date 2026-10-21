/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type FolderContentsResponse,
  type FolderRef,
  type FolderSummary,
  type NodeSummary,
  type QuickAccessList,
  quickAccessLimitMessage,
} from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { StorageApi } from '../api';
import { StorageRequestError } from '../storage-request-error';
import { GB, spaceSummaryWith } from '../test-space-summary';

import { MyFiles } from './my-files';
import { UploadsSpaceProvider } from './space-provider';
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
  updatedAt: AT,
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
  updatedAt: AT,
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

const NO_QUICK_ACCESS: QuickAccessList = { pinned: [], recent: [], hasMoreRecent: false };

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
    quickAccess: jest.fn(() => Promise.resolve(NO_QUICK_ACCESS)),
    pin: jest.fn(pending),
    unpin: jest.fn(() => Promise.resolve()),
    recordRecent: jest.fn(() => Promise.resolve()),
    spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))),
    ...overrides,
  } as StorageApi;
}

/** Mis archivos en la raíz con los proveedores del layout de `(cliente)`: cargas y resumen de espacio (007). */
function renderMyFiles(api: StorageApi): void {
  render(
    <UploadsProvider api={api}>
      <UploadsSpaceProvider>
        <MyFiles folderId={null} />
      </UploadsSpaceProvider>
    </UploadsProvider>,
  );
}

async function renderMyFilesWithAlphaExpanded(api: StorageApi): Promise<void> {
  renderMyFiles(api);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Mostrar contenido de Proyecto Alpha' }),
  );
  await screen.findByText('acta.pdf');
}

async function chooseRowAction(name: string, action: string): Promise<void> {
  const table = screen.getByRole('table');
  await userEvent.click(within(table).getByRole('button', { name: `Acciones de ${name}` }));
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

function desktopSidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
}

async function renderRoot(api: StorageApi): Promise<void> {
  renderMyFiles(api);
  await screen.findByText('raiz.pdf');
}

describe('MyFiles con accesos rápidos (006 CA-27, CA-28)', () => {
  it('CA-27: «Fijar en la barra lateral» en una subcarpeta la fija y la barra se refresca', async () => {
    const quickAccess = jest
      .fn<Promise<QuickAccessList>, []>()
      .mockResolvedValueOnce(NO_QUICK_ACCESS)
      .mockResolvedValue({ ...NO_QUICK_ACCESS, pinned: [{ type: 'folder', ...FASE3 }] });
    const api = fakeApi({
      quickAccess,
      pin: jest.fn(() => Promise.resolve({ type: 'folder' as const, ...FASE3 })),
    });
    await renderMyFilesWithAlphaExpanded(api);
    expect(within(desktopSidebar()).queryByText('Accesos rápidos')).toBeNull();

    await chooseRowAction('Fase 3', 'Fijar en la barra lateral');

    expect(api.pin).toHaveBeenCalledWith('folder', FASE3.id);
    expect(
      await within(desktopSidebar()).findByRole('link', { name: 'Fase 3, carpeta' }),
    ).toBeTruthy();
  });

  it('CA-27: lo fijado (según GET /quick-access) ofrece «Quitar de la barra lateral» en su fila', async () => {
    const api = fakeApi({
      quickAccess: jest.fn(() =>
        Promise.resolve({
          ...NO_QUICK_ACCESS,
          pinned: [{ type: 'file' as const, id: 'f-root', name: 'raiz.pdf', kind: 'pdf' as const }],
        }),
      ),
    });
    await renderRoot(api);
    await within(desktopSidebar()).findByText('Accesos rápidos');

    await chooseRowAction('raiz.pdf', 'Quitar de la barra lateral');

    expect(api.unpin).toHaveBeenCalledWith('file', 'f-root');
  });

  it('CA-28: el sexto fijado muestra el aviso de advertencia arriba de la lista y no cambia nada', async () => {
    const api = fakeApi({
      pin: jest.fn(() =>
        Promise.reject(
          new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT, {
            maxPinned: 5,
          }),
        ),
      ),
    });
    await renderRoot(api);

    await chooseRowAction('Proyecto Alpha', 'Fijar en la barra lateral');

    const notice = await screen.findByTestId('explorer-notice');
    const alert = within(notice).getByRole('status');
    expect(alert.textContent).toContain(quickAccessLimitMessage(5));
    expect(alert.className).toContain('border-warning');
    expect(api.quickAccess).toHaveBeenCalledTimes(1);
    await userEvent.click(within(alert).getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText(quickAccessLimitMessage(5))).toBeNull();
  });

  it('CA-27 (Q-3): abrir Mis archivos o desglosar una carpeta no la registra como reciente', async () => {
    const api = fakeApi();
    await renderMyFilesWithAlphaExpanded(api);

    expect(api.recordRecent).not.toHaveBeenCalled();
  });

  it('CA-27 (Q-3): descargar un archivo desde su fila lo registra como reciente y refresca la barra', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      downloadUrl: jest.fn(() =>
        Promise.resolve({ url: 'https://objetos.local/firmada', expiresAt: AT }),
      ),
    });
    await renderRoot(api);

    await chooseRowAction('raiz.pdf', 'Descargar');

    await waitFor(() => expect(api.recordRecent).toHaveBeenCalledWith('file', 'f-root'));
    await waitFor(() => expect(api.quickAccess).toHaveBeenCalledTimes(2));
    jest.restoreAllMocks();
  });

  it('CA-27: un archivo de la barra se descarga como en 005 y cuenta como reciente', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      quickAccess: jest.fn(() =>
        Promise.resolve({
          ...NO_QUICK_ACCESS,
          recent: [{ type: 'file' as const, id: 'f-a', name: 'acta.pdf', kind: 'pdf' as const }],
        }),
      ),
      downloadUrl: jest.fn(() =>
        Promise.resolve({ url: 'https://objetos.local/firmada', expiresAt: AT }),
      ),
    });
    await renderRoot(api);

    await userEvent.click(
      await within(desktopSidebar()).findByRole('button', {
        name: 'acta.pdf, archivo, se descarga',
      }),
    );

    expect(api.downloadUrl).toHaveBeenCalledWith('f-a');
    await waitFor(() => expect(api.recordRecent).toHaveBeenCalledWith('file', 'f-a'));
    jest.restoreAllMocks();
  });

  it('CA-27: si la descarga desde la barra falla, el aviso va arriba de la lista', async () => {
    const api = fakeApi({
      quickAccess: jest.fn(() =>
        Promise.resolve({
          ...NO_QUICK_ACCESS,
          pinned: [{ type: 'file' as const, id: 'f-a', name: 'acta.pdf', kind: 'pdf' as const }],
        }),
      ),
      downloadUrl: jest.fn(() =>
        Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
      ),
    });
    await renderRoot(api);

    await userEvent.click(
      await within(desktopSidebar()).findByRole('button', {
        name: 'acta.pdf, archivo, se descarga',
      }),
    );
    await act(async () => undefined);

    expect(within(screen.getByTestId('explorer-notice')).getByRole('alert').textContent).toContain(
      'No encontramos «acta.pdf».',
    );
    expect(api.recordRecent).not.toHaveBeenCalled();
  });
});

const PINNED_RAIZ: QuickAccessList = {
  ...NO_QUICK_ACCESS,
  pinned: [{ type: 'file', id: 'f-root', name: 'raiz.pdf', kind: 'pdf' }],
};
const RAIZ_IN_SIDEBAR = 'raiz.pdf, archivo, se descarga';

describe('MyFiles mantiene al día los accesos rápidos (006 CA-27)', () => {
  it('CA-27: mover a la papelera un fijado lo saca de la barra sin navegar', async () => {
    const quickAccess = jest
      .fn<Promise<QuickAccessList>, []>()
      .mockResolvedValueOnce(PINNED_RAIZ)
      .mockResolvedValue(NO_QUICK_ACCESS);
    const api = fakeApi({
      quickAccess,
      moveToTrash: jest.fn(() => Promise.resolve({} as never)),
    });
    await renderRoot(api);
    await within(desktopSidebar()).findByRole('button', { name: RAIZ_IN_SIDEBAR });

    await chooseRowAction('raiz.pdf', 'Mover a la papelera');

    await waitFor(() =>
      expect(within(desktopSidebar()).queryByRole('button', { name: RAIZ_IN_SIDEBAR })).toBeNull(),
    );
  });

  it('CA-27: renombrar un fijado muestra el nombre nuevo en la barra', async () => {
    const quickAccess = jest
      .fn<Promise<QuickAccessList>, []>()
      .mockResolvedValueOnce({ ...NO_QUICK_ACCESS, pinned: [{ type: 'folder', ...ALPHA }] })
      .mockResolvedValue({
        ...NO_QUICK_ACCESS,
        pinned: [{ type: 'folder', id: ALPHA.id, name: 'Proyecto Beta' }],
      });
    const api = fakeApi({
      quickAccess,
      renameFolder: jest.fn(() =>
        Promise.resolve(folderSummary({ id: ALPHA.id, name: 'Proyecto Beta' }, null)),
      ),
    });
    await renderRoot(api);
    await within(desktopSidebar()).findByRole('link', { name: 'Proyecto Alpha, carpeta' });

    await chooseRowAction('Proyecto Alpha', 'Renombrar');
    const field = screen.getByRole('textbox');
    await userEvent.clear(field);
    await userEvent.type(field, 'Proyecto Beta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));

    expect(
      await within(desktopSidebar()).findByRole('link', { name: 'Proyecto Beta, carpeta' }),
    ).toBeTruthy();
  });
});

function explorerAlert(): HTMLElement {
  return within(screen.getByTestId('explorer-notice')).getByRole('alert');
}

describe('MyFiles avisa cuando fijar o quitar falla (006 CA-27)', () => {
  it('CA-27: si fijar falla sin ser el tope, el aviso va arriba de la lista y «Reintentar» lo repite', async () => {
    const api = fakeApi({ pin: jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))) });
    await renderRoot(api);

    await chooseRowAction('Proyecto Alpha', 'Fijar en la barra lateral');

    const alert = await waitFor(explorerAlert);
    expect(alert.textContent).toContain('No pudimos fijar «Proyecto Alpha» en la barra lateral.');
    expect(alert.textContent).toContain('Revisa tu conexión e inténtalo de nuevo.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(api.pin).toHaveBeenCalledTimes(2);
    await userEvent.click(within(explorerAlert()).getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByTestId('explorer-notice')).toBeNull();
  });

  it('CA-27: si quitar desde la fila falla, el aviso va arriba de la lista', async () => {
    const api = fakeApi({
      quickAccess: jest.fn(() => Promise.resolve(PINNED_RAIZ)),
      unpin: jest.fn(() =>
        Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
      ),
    });
    await renderRoot(api);
    await within(desktopSidebar()).findByRole('button', { name: RAIZ_IN_SIDEBAR });

    await chooseRowAction('raiz.pdf', 'Quitar de la barra lateral');

    const alert = await waitFor(explorerAlert);
    expect(alert.textContent).toContain('No pudimos quitar «raiz.pdf» de la barra lateral.');
    expect(within(alert).getByRole('button', { name: 'Actualizar lista' })).toBeTruthy();
  });

  it('CA-27: si quitar desde el ⋮ de la barra falla, el aviso también va arriba de la lista', async () => {
    const api = fakeApi({
      quickAccess: jest.fn(() => Promise.resolve(PINNED_RAIZ)),
      unpin: jest.fn(() =>
        Promise.reject(new StorageRequestError(429, STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS)),
      ),
    });
    await renderRoot(api);

    await userEvent.click(
      await within(desktopSidebar()).findByRole('button', { name: 'Acciones de raiz.pdf' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar de la barra lateral' }));

    const alert = await waitFor(explorerAlert);
    expect(alert.textContent).toContain('No pudimos quitar «raiz.pdf» de la barra lateral.');
    expect(alert.textContent).toContain('Hiciste demasiadas solicitudes.');
    expect(within(desktopSidebar()).getByRole('button', { name: RAIZ_IN_SIDEBAR })).toBeTruthy();
  });
});

const seriousViolationsOf = (results: Awaited<ReturnType<typeof axe>>): unknown[] =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

describe('MyFiles en solo lectura (spec 010 CA-13, CA-14, RN-6)', () => {
  const readOnlyApi = (overrides: Partial<StorageApi> = {}): StorageApi =>
    fakeApi({
      spaceSummary: jest.fn(() =>
        Promise.resolve({ ...spaceSummaryWith(4.8 * GB), readOnly: true }),
      ),
      ...overrides,
    });

  it('CA-14: el aviso con «Renovar plan», y «Nueva carpeta» y «Subir archivos» deshabilitadas con su explicación', async () => {
    renderMyFiles(readOnlyApi());

    expect(await screen.findByText('Tu cuenta está en solo lectura.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Renovar plan' }).getAttribute('href')).toBe(
      '/suscripcion/renovar',
    );
    expect(
      (screen.getByRole('button', { name: 'Nueva carpeta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Subir archivos' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        'Tu cuenta está en solo lectura: no puedes subir, crear, renombrar, mover ni restaurar.',
      ),
    ).toBeTruthy();
    await screen.findByText('raiz.pdf');
    expect(seriousViolationsOf(await axe(document.body))).toEqual([]);
  });

  it('CA-13, RN-6: en el menú, renombrar y mover se deshabilitan; papelera y fijar siguen', async () => {
    renderMyFiles(readOnlyApi());
    await screen.findByText('Tu cuenta está en solo lectura.');
    const table = await screen.findByRole('table');

    await userEvent.click(within(table).getByRole('button', { name: 'Acciones de raiz.pdf' }));

    expect(screen.getByRole('menuitem', { name: 'Renombrar' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Mover a…' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Mover a la papelera' }).getAttribute('aria-disabled'),
    ).toBeNull();
    expect(
      screen
        .getByRole('menuitem', { name: 'Fijar en la barra lateral' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('CA-14: una carpeta vacía no ofrece «Subir archivos» ni invita a subir', async () => {
    const empty: FolderContentsResponse = {
      folder: null,
      breadcrumbs: [],
      items: [],
      nextCursor: null,
    };
    renderMyFiles(readOnlyApi({ folderContents: jest.fn(() => Promise.resolve(empty)) }));

    expect(await screen.findByText('Aún no tienes archivos')).toBeTruthy();
    expect(screen.getByText('Cuando renueves tu plan podrás subir documentos aquí.')).toBeTruthy();
    const uploads = screen.getAllByRole('button', { name: 'Subir archivos' });
    expect(uploads).toHaveLength(1);
    expect((uploads[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('CA-14: soltar un archivo muestra el mensaje de CA-13 y no inicia la carga', async () => {
    const api = readOnlyApi();
    renderMyFiles(api);
    await screen.findByText('Tu cuenta está en solo lectura.');
    const file = new File(['hola'], 'nuevo.pdf', { type: 'application/pdf' });

    fireEvent.drop(screen.getByTestId('upload-dropzone'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(
      await screen.findByText(
        /Tu suscripción venció y tu cuenta está en solo lectura\. Renueva tu plan/,
      ),
    ).toBeTruthy();
    expect(api.init).not.toHaveBeenCalled();
  });

  it('CA-14: el mensaje del arrastre se borra al cambiar de carpeta', async () => {
    const api = readOnlyApi();
    const tree = (folderId: string | null) => (
      <UploadsProvider api={api}>
        <UploadsSpaceProvider>
          <MyFiles folderId={folderId} />
        </UploadsSpaceProvider>
      </UploadsProvider>
    );
    const { rerender } = render(tree(null));
    await screen.findByText('Tu cuenta está en solo lectura.');
    fireEvent.drop(screen.getByTestId('upload-dropzone'), {
      dataTransfer: { files: [new File(['hola'], 'nuevo.pdf')], types: ['Files'] },
    });
    await screen.findByText(/Tu suscripción venció y tu cuenta está en solo lectura\. Renueva/);

    rerender(tree(ALPHA.id));

    await screen.findByText('acta.pdf');
    expect(
      screen.queryByText(/Tu suscripción venció y tu cuenta está en solo lectura\. Renueva/),
    ).toBeNull();
  });
});
