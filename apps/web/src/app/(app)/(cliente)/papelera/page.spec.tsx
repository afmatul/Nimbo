/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type ListTrashResponse,
  type RestoreResponse,
  type TrashItem,
  type TrashSummary,
} from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { toast } from 'sonner';

import { SessionProvider } from '../../../../features/identity/session/session-provider';
import type { StorageApi } from '../../../../features/storage/api';
import { UploadsProvider } from '../../../../features/storage/components/uploads-provider';
import { EMPTY_POLL_INTERVAL_MS } from '../../../../features/storage/hooks/use-trash';
import { StorageRequestError } from '../../../../features/storage/storage-request-error';

import PapeleraPage from './page';

const DAY_MS = 86_400_000;
const NOW = Date.now();
const FASE3 = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };

function trashItem(
  id: string,
  name: string,
  daysLeft: number,
  overrides: Partial<TrashItem> = {},
): TrashItem {
  return {
    id,
    type: 'file',
    name,
    kind: 'docx',
    sizeBytes: 840_000,
    originalFolder: FASE3,
    deletedAt: new Date(NOW - DAY_MS).toISOString(),
    purgeAt: new Date(NOW + daysLeft * DAY_MS - 60_000).toISOString(),
    ...overrides,
  };
}

const BORRADOR = trashItem(
  '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  'Borrador_propuesta_v1.docx',
  60,
);
const CAPTURAS = trashItem('2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', 'Capturas_v1', 51, {
  type: 'folder',
  kind: undefined,
  sizeBytes: 1_400_000_000,
  originalFolder: null,
});
const ACTA = trashItem('3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b', 'Acta_reunion_kickoff.pdf', 1, {
  kind: 'pdf',
  sizeBytes: 2_100_000,
});
const ITEMS = [BORRADOR, CAPTURAS, ACTA];
const SUMMARY: TrashSummary = { itemCount: 3, totalBytes: 1_402_940_000, retentionDays: 60 };

function page(items: readonly TrashItem[]): ListTrashResponse {
  return { items: [...items], nextCursor: null };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function restoredAs(
  item: TrashItem,
  outcome: RestoreResponse['outcome'],
  name = item.name,
): RestoreResponse {
  return {
    item: {
      type: 'file',
      id: item.id,
      name,
      sizeBytes: item.sizeBytes,
      kind: 'docx',
      folderId: outcome === 'moved_to_root' ? null : FASE3.id,
      createdAt: item.deletedAt,
    },
    outcome,
    originalName: item.name,
  };
}

function fakeApi(overrides: Partial<StorageApi> = {}): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => never()),
    resume: jest.fn(() => never()),
    complete: jest.fn(() => never()),
    cancel: jest.fn(() => Promise.resolve()),
    folderContents: jest.fn(() => never()),
    createFolder: jest.fn(() => never()),
    downloadUrl: jest.fn(() => never()),
    moveToTrash: jest.fn(() => never()),
    listTrash: jest.fn(() => Promise.resolve(page(ITEMS))),
    trashSummary: jest.fn(() => Promise.resolve(SUMMARY)),
    restore: jest.fn(() => never()),
    purge: jest.fn(() => never()),
    emptyTrash: jest.fn(() => never()),
    quickAccess: jest.fn(() => never()),
    ...overrides,
  } as jest.Mocked<StorageApi>;
}

async function renderPage(api: StorageApi): Promise<HTMLElement> {
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <UploadsProvider api={api}>
        <PapeleraPage />
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name, { selector: 'span[title]' }).closest('tr');
  if (!row) throw new Error(`Sin fila para ${name}`);
  return row;
}

async function openRowMenu(name: string): Promise<void> {
  await userEvent.click(within(rowOf(name)).getByRole('button', { name: `Acciones de ${name}` }));
}

describe('página Papelera (/papelera)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
  });

  afterEach(async () => {
    await act(async () => {
      toast.dismiss();
    });
    jest.useRealTimers();
  });

  it('CA-12: mientras llega la lista muestra «Cargando la papelera…»', async () => {
    await renderPage(fakeApi({ listTrash: jest.fn(() => never()) }));

    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Cargando la papelera…');
  });

  it('CA-12: lista nombre, tipo, ubicación, tamaño, fecha y días; resumen arriba y contador lateral', async () => {
    await renderPage(fakeApi());

    const table = await screen.findByRole('table');
    expect(within(rowOf('Capturas_v1')).getByText('Carpeta')).toBeTruthy();
    expect(rowOf('Capturas_v1').textContent).toContain('Mis archivos');
    expect(rowOf('Borrador_propuesta_v1.docx').textContent).toContain('Fase 3 · RAG');
    expect(rowOf('Borrador_propuesta_v1.docx').textContent).toContain('840 KB');
    expect(rowOf('Borrador_propuesta_v1.docx').textContent).toContain('60 días');
    expect(within(table).queryByRole('button', { name: /Descargar/ })).toBeNull();
    const summary = screen.getByRole('region', { name: 'Resumen de la papelera' });
    expect(summary.textContent).toContain('1,4 GB');
    expect(summary.textContent).toContain('60 días');
    expect(screen.getAllByText('3 elementos', { selector: 'p' })).toHaveLength(2);
    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('link', { name: 'Papelera (3 elementos)' })).toBeTruthy();
  });

  it('006 CA-27: la barra lateral de la papelera también tiene «Accesos rápidos», sin registrar recientes', async () => {
    const api = fakeApi({
      quickAccess: jest.fn(() =>
        Promise.resolve({
          pinned: [{ type: 'folder' as const, id: ITEMS[0]?.id ?? '', name: 'Proyecto Alpha' }],
          recent: [],
          hasMoreRecent: false,
        }),
      ),
      recordRecent: jest.fn(() => Promise.resolve()),
    });
    await renderPage(api);

    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(
      await within(sidebar).findByRole('link', { name: 'Proyecto Alpha, carpeta' }),
    ).toBeTruthy();
    expect(api.recordRecent).not.toHaveBeenCalled();
  });

  it('CA-12: avisa los que se purgan en los próximos 7 días, con reloj en la fila', async () => {
    await renderPage(fakeApi());

    const note = await screen.findByRole('note');
    expect(note.textContent).toBe(
      '1 elemento se eliminará definitivamente en los próximos 7 días. Restáuralos antes de esa fecha si los necesitas.',
    );
    expect(rowOf('Acta_reunion_kickoff.pdf').textContent).toContain('1 día');
  });

  it('CA-12: vacía, dice los días de retención y enlaza a Mis archivos', async () => {
    await renderPage(
      fakeApi({
        listTrash: jest.fn(() => Promise.resolve(page([]))),
        trashSummary: jest.fn(() =>
          Promise.resolve({ itemCount: 0, totalBytes: 0, retentionDays: 60 }),
        ),
      }),
    );

    expect(await screen.findByRole('heading', { name: 'La papelera está vacía' })).toBeTruthy();
    expect(
      screen.getByText('Lo que elimines aparecerá aquí durante 60 días, la retención de tu plan.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(screen.queryByRole('button', { name: 'Vaciar papelera' })).toBeNull();
  });

  it('CA-12: si la lista falla, tranquiliza y «Reintentar» la vuelve a pedir', async () => {
    const listTrash = jest
      .fn<Promise<ListTrashResponse>, []>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(page(ITEMS));
    await renderPage(fakeApi({ listTrash }));

    expect(await screen.findByText('No pudimos cargar la papelera.')).toBeTruthy();
    expect(screen.getByText('Lo que eliminaste sigue a salvo. Inténtalo de nuevo.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(listTrash).toHaveBeenCalledTimes(2);
  });

  it('CA-13: restaurar uno sin cambios lo quita de la lista y avisa con «Abrir carpeta»', async () => {
    const api = fakeApi({
      restore: jest.fn(() => Promise.resolve(restoredAs(BORRADOR, 'restored'))),
    });
    await renderPage(api);
    await screen.findByRole('table');

    await userEvent.click(
      screen.getByRole('button', { name: 'Restaurar Borrador_propuesta_v1.docx' }),
    );

    expect(api.restore).toHaveBeenCalledWith('file', BORRADOR.id);
    expect(
      await screen.findByText('Restauramos «Borrador_propuesta_v1.docx» en Fase 3 · RAG.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir carpeta' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${FASE3.id}`,
    );
    expect(
      screen.queryByText('Borrador_propuesta_v1.docx', { selector: 'span[title]' }),
    ).toBeNull();
    expect(api.trashSummary).toHaveBeenCalledTimes(2);
  });

  it('CA-14, CA-15, CA-17: restaurar la selección informa el resultado por elemento', async () => {
    const restore = jest.fn((type: TrashItem['type'], id: string) => {
      if (id === BORRADOR.id) {
        return Promise.resolve(restoredAs(BORRADOR, 'renamed', 'Borrador_propuesta_v1 (1).docx'));
      }
      if (id === CAPTURAS.id) {
        return Promise.reject(
          new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
            maxDepth: 10,
          }),
        );
      }
      return Promise.resolve(restoredAs(ACTA, 'moved_to_root'));
    });
    await renderPage(fakeApi({ restore }));
    await screen.findByRole('table');

    for (const item of ITEMS) {
      await userEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${item.name}` }));
    }
    const bar = screen.getByRole('region', { name: 'Selección' });
    expect(bar.textContent).toContain('3 seleccionados');
    await userEvent.click(within(bar).getByRole('button', { name: 'Restaurar 3' }));

    const panel = await screen.findByRole('status', { name: 'Restauramos 2 de 3 elementos' });
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Restaurado con cambios. Restauramos «Borrador_propuesta_v1.docx» como «Borrador_propuesta_v1 (1).docx» porque ya existía uno con ese nombre.',
      'No restaurado. No podemos restaurar «Capturas_v1» aquí porque superaría 10 niveles de carpetas. Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.',
      'Restaurado con cambios. La carpeta original ya no está disponible. Restauramos «Acta_reunion_kickoff.pdf» en Mis archivos.',
    ]);
    expect(restore).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Capturas_v1', { selector: 'span[title]' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Selección' })).toBeNull();

    await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar resultado' }));
    expect(screen.queryByRole('status', { name: 'Restauramos 2 de 3 elementos' })).toBeNull();
  });

  it('CA-18: «Eliminar definitivamente» desde ⋮ confirma, elimina y quita la fila', async () => {
    const api = fakeApi({ purge: jest.fn(() => Promise.resolve({ freedBytes: 2_100_000 })) });
    await renderPage(api);
    await screen.findByRole('table');

    await openRowMenu('Acta_reunion_kickoff.pdf');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar definitivamente' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Liberarás 2,1 MB de espacio.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar definitivamente' }));

    expect(api.purge).toHaveBeenCalledWith('file', ACTA.id);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.queryByText('Acta_reunion_kickoff.pdf', { selector: 'span[title]' })).toBeNull();
  });

  it('CA-18: «Vaciar papelera» deja las filas en «Vaciando…» y avisa al terminar', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const trashSummary = jest
      .fn<Promise<TrashSummary>, []>()
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValue({ itemCount: 0, totalBytes: 0, retentionDays: 60 });
    const api = fakeApi({
      trashSummary,
      emptyTrash: jest.fn(() =>
        Promise.resolve({ scheduledItems: 3, pendingBytes: SUMMARY.totalBytes }),
      ),
    });
    await renderPage(api);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Vaciar papelera' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Vaciar la papelera?' });
    await user.click(within(dialog).getByRole('button', { name: 'Vaciar papelera' }));

    expect(await screen.findByText('Estamos vaciando la papelera.')).toBeTruthy();
    expect(screen.getAllByText('Vaciando…').length).toBeGreaterThanOrEqual(ITEMS.length);
    expect(screen.queryByRole('button', { name: /^Restaurar / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Vaciar papelera' }).hasAttribute('disabled')).toBe(
      true,
    );

    await act(async () => {
      jest.advanceTimersByTime(EMPTY_POLL_INTERVAL_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(EMPTY_POLL_INTERVAL_MS);
    });

    expect(await screen.findByRole('heading', { name: 'La papelera está vacía' })).toBeTruthy();
    expect(screen.getByText('Vaciaste la papelera. Liberaste 1,4 GB de espacio.')).toBeTruthy();
  });

  it('CA-25: sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderPage(fakeApi());
    await screen.findByRole('table');

    for (const width of [360, 1440]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.dispatchEvent(new Event('resize'));
      const results = await act(async () => axe(container));
      expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
    }
  });
});
