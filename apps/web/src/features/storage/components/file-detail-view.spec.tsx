/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type DownloadUrlResponse,
  type FileVersionsResponse,
} from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetSession, rememberSession } from '../../identity/session/session-memory';
import { SessionProvider } from '../../identity/session/session-provider';
import { sessionFixture } from '../../identity/session/test-session';
import type { StorageApi } from '../api';
import { StorageRequestError } from '../storage-request-error';
import { GB, spaceSummaryWith } from '../test-space-summary';
import { pruneWarning, versionFixture, VERSIONED_FILE } from '../test-versions';

import { FileDetailView } from './file-detail-view';
import { PREPARING_DELAY_MS } from './file-row-menu';
import { UploadsSpaceProvider } from './space-provider';
import { UploadsProvider } from './uploads-provider';

const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const version = versionFixture;

const V5 = version({ number: 5, sizeBytes: 2_600_000, deltaBytes: '200000', isCurrent: true });
const V4 = version({
  number: 4,
  origin: 'restauracion',
  restoredFromNumber: 2,
  sizeBytes: 2_400_000,
  deltaBytes: '-100000',
});
const V3 = version({ number: 3 });
const V6 = version({
  number: 6,
  origin: 'restauracion',
  restoredFromNumber: 4,
  sizeBytes: 2_400_000,
  deltaBytes: '-200000',
  isCurrent: true,
});

const FOLDER_ID = '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f';
const historyOf = (items: FileVersionsResponse['items']): FileVersionsResponse => ({
  file: VERSIONED_FILE,
  items,
  retainedVersions: 3,
});
const AT_LIMIT = historyOf([V5, V4, V3]);
const WITH_ROOM = historyOf([V5, V4]);
const AFTER_RESTORE: FileVersionsResponse = {
  file: VERSIONED_FILE,
  items: [V6, { ...V5, isCurrent: false }, V4],
  retainedVersions: 3,
};
const SIGNED: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-10-08T10:05:00.000Z',
};

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function fakeApi(overrides: Partial<StorageApi> = {}): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => never()),
    resume: jest.fn(() => never()),
    complete: jest.fn(() => never()),
    cancel: jest.fn(() => Promise.resolve()),
    trashSummary: jest.fn(() =>
      Promise.resolve({ itemCount: 0, totalBytes: 0, retentionDays: 60 }),
    ),
    quickAccess: jest.fn(() => Promise.resolve({ pinned: [], recent: [], hasMoreRecent: false })),
    recordRecent: jest.fn(() => Promise.resolve()),
    spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))),
    fileVersions: jest.fn(() => Promise.resolve(AT_LIMIT)),
    restoreVersion: jest.fn(() => never()),
    versionDownloadUrl: jest.fn(() => never()),
    ...overrides,
  } as jest.Mocked<StorageApi>;
}

async function renderView(api: StorageApi, openUrl = jest.fn()): Promise<void> {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <UploadsProvider api={api}>
        <UploadsSpaceProvider>
          <FileDetailView fileId={FILE_ID} openUrl={openUrl} />
        </UploadsSpaceProvider>
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

function history(): HTMLElement {
  return screen.getByRole('list', { name: 'Historial de versiones' });
}

function itemOf(number: number): HTMLElement {
  const found = within(history())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(`Versión ${String(number)}`));
  if (!found) throw new Error(`Sin la versión ${String(number)}`);
  return found;
}

describe('FileDetailView: ficha de archivo con historial (014 CA-6, CA-7, CA-15, CA-20)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
    rememberSession(sessionFixture());
  });

  afterEach(() => {
    forgetSession();
    jest.useRealTimers();
  });

  it('CA-6, CA-20 (default): historial completo; la versión actual solo se descarga', async () => {
    const api = fakeApi();
    await renderView(api);

    expect(api.fileVersions).toHaveBeenCalledWith(FILE_ID);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Informe_avance_sep.docx');
    expect(screen.getByText('2,6 MB · versión 5')).toBeTruthy();
    expect(
      await screen.findByText('3 versiones · tu plan Personal conserva 3, contando la actual'),
    ).toBeTruthy();
    expect(within(itemOf(5)).getByRole('button', { name: 'Descargar la versión 5' })).toBeTruthy();
    expect(within(itemOf(5)).queryByRole('button', { name: /Restaurar/ })).toBeNull();
    expect(within(itemOf(4)).getByRole('button', { name: 'Restaurar la versión 4' })).toBeTruthy();
    expect(itemOf(4).textContent).toContain(', por Tú');
    expect(
      screen.getByText(
        'Restaurar crea una versión nueva; solo se elimina la más antigua cuando pasas el límite de tu plan.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('7,5 MB de tu espacio')).toBeTruthy();
  });

  it('CA-20: el encabezado y los detalles dicen el nombre, el tipo y la ubicación del archivo', async () => {
    await renderView(fakeApi());

    expect(screen.getByRole('heading', { level: 1, name: 'Informe_avance_sep.docx' })).toBeTruthy();
    expect(screen.getByText('DOCX')).toBeTruthy();
    const details = screen.getByRole('region', { name: 'Detalles' });
    expect(within(details).getByText('Documento de Word (.docx)')).toBeTruthy();
    expect(within(details).getByRole('link', { name: 'Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
  });

  it('CA-20: un archivo en una carpeta enlaza a ella desde «Volver» y desde «Ubicación»', async () => {
    const inFolder = { ...AT_LIMIT, file: { ...VERSIONED_FILE, folderId: FOLDER_ID } };
    await renderView(fakeApi({ fileVersions: jest.fn(() => Promise.resolve(inFolder)) }));

    const folderHref = `/archivos/carpeta/${FOLDER_ID}`;
    expect(screen.getByRole('link', { name: 'Volver a la carpeta' }).getAttribute('href')).toBe(
      folderHref,
    );
    const details = screen.getByRole('region', { name: 'Detalles' });
    expect(
      within(details).getByRole('link', { name: 'Abrir la carpeta' }).getAttribute('href'),
    ).toBe(folderHref);
  });

  it('CA-20 (cargando): sin el archivo aún, el título es genérico', async () => {
    await renderView(fakeApi({ fileVersions: jest.fn(() => never()) }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Versiones del archivo');
  });

  it('CA-20 (una-version): solo «Descargar» y cómo nacen las versiones', async () => {
    const single = { ...version({ number: 1, isCurrent: true }) };
    await renderView(
      fakeApi({
        fileVersions: jest.fn(() => Promise.resolve(historyOf([single]))),
      }),
    );

    expect(itemOf(1).textContent).toContain('Primera versión');
    expect(screen.queryByRole('button', { name: /Restaurar/ })).toBeNull();
    expect(screen.getByText('Aún no hay versiones anteriores.')).toBeTruthy();
  });

  it('CA-20 (cargando): anuncia que carga el historial', async () => {
    await renderView(fakeApi({ fileVersions: jest.fn(() => never()) }));

    expect(screen.getByText('Cargando el historial…').closest('[role="status"]')).not.toBeNull();
  });

  it('CA-20 (error): «Reintentar» vuelve a pedir el historial', async () => {
    let fails = true;
    const fileVersions = jest.fn(() =>
      fails ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(AT_LIMIT),
    );
    await renderView(fakeApi({ fileVersions }));

    expect(await screen.findByText('No pudimos cargar el historial.')).toBeTruthy();
    fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('list', { name: 'Historial de versiones' })).toBeTruthy();
    expect(fileVersions).toHaveBeenCalledTimes(2);
  });

  it('CA-16, CA-17 (no-encontrado): el mismo mensaje para papelera, inexistente o ajeno', async () => {
    const gone = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);
    await renderView(fakeApi({ fileVersions: jest.fn(() => Promise.reject(gone)) }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'No encontramos este archivo.' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(screen.queryByRole('list', { name: 'Historial de versiones' })).toBeNull();
  });

  it('CA-20 (confirmar-restauracion): con espacio en el plan, confirma sin aviso de poda', async () => {
    await renderView(fakeApi({ fileVersions: jest.fn(() => Promise.resolve(WITH_ROOM)) }));

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));

    const dialog = screen.getByRole('alertdialog', { name: '¿Restaurar la versión 4?' });
    expect(dialog.textContent).toContain('Usará 2,4 MB de tu espacio.');
    expect(dialog.textContent).toContain('Versión 5 · se conserva en el historial');
    expect(dialog.textContent).not.toContain('Se eliminará');
  });

  it('CA-15 (aviso-de-poda): en el límite avisa que se eliminará la más antigua', async () => {
    await renderView(fakeApi());

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));

    expect(pruneWarning(screen.getByRole('alertdialog')).textContent).toContain(
      'Al continuar se eliminará la versión 3, la más antigua.',
    );
  });

  it('CA-9 (restaurada): aviso, historial recargado con «NUEVA» y espacio actualizado', async () => {
    const fileVersions = jest
      .fn<Promise<FileVersionsResponse>, [string]>()
      .mockResolvedValueOnce(AT_LIMIT)
      .mockResolvedValueOnce(AFTER_RESTORE);
    const api = fakeApi({ fileVersions, restoreVersion: jest.fn(() => Promise.resolve(V6)) });
    await renderView(api);

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    expect(api.restoreVersion).toHaveBeenCalledWith(FILE_ID, V4.id);
    expect(await screen.findByText('Restauraste la versión 4 como versión 6.')).toBeTruthy();
    await waitFor(() => expect(itemOf(6).textContent).toContain('NUEVA'));
    expect(itemOf(6).textContent).toContain('Restauración de la versión 4');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.spaceSummary).toHaveBeenCalledTimes(2);
  });

  it('CA-11 (error-version-no-encontrada): cierra el diálogo y ofrece «Actualizar historial»', async () => {
    const missing = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND);
    const api = fakeApi({ restoreVersion: jest.fn(() => Promise.reject(missing)) });
    await renderView(api);

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 3' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No encontramos la versión 3.');
    expect(alert.textContent).toContain('Actualiza el historial para ver las disponibles.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar historial' }));
    expect(api.fileVersions).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA-10: si otra pestaña ya la hizo actual, lo dice y ofrece «Actualizar historial»', async () => {
    const current = new StorageRequestError(
      409,
      STORAGE_ERROR_CODES.STORAGE_VERSION_ALREADY_CURRENT,
    );
    await renderView(fakeApi({ restoreVersion: jest.fn(() => Promise.reject(current)) }));

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Esta ya es la versión actual.',
    );
    expect(screen.getByRole('button', { name: 'Actualizar historial' })).toBeTruthy();
  });

  it('CA-12 (error-cuota): el 422 queda en el diálogo con «Liberar espacio»', async () => {
    const quota = new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED, {
      missingBytes: 1_600_000,
    });
    await renderView(fakeApi({ restoreVersion: jest.fn(() => Promise.reject(quota)) }));

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versión 4' }));

    const dialog = screen.getByRole('alertdialog');
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Te faltan 1,6 MB de espacio para restaurar esta versión.',
    );
    expect(within(dialog).getByRole('link', { name: 'Liberar espacio' })).toBeTruthy();
  });

  it('CA-8: descargar una versión abre su URL firmada', async () => {
    const openUrl = jest.fn();
    const api = fakeApi({ versionDownloadUrl: jest.fn(() => Promise.resolve(SIGNED)) });
    await renderView(api, openUrl);

    await userEvent.click(screen.getByRole('button', { name: 'Descargar la versión 4' }));

    expect(api.versionDownloadUrl).toHaveBeenCalledWith(FILE_ID, V4.id);
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(SIGNED.url));
  });

  it('CA-8: «Descargar» del encabezado baja la versión actual', async () => {
    const api = fakeApi({ versionDownloadUrl: jest.fn(() => Promise.resolve(SIGNED)) });
    await renderView(api);

    await userEvent.click(screen.getByRole('button', { name: 'Descargar la versión actual' }));

    expect(api.versionDownloadUrl).toHaveBeenCalledWith(FILE_ID, V5.id);
  });

  it('CA-20 (descarga-preparando): pasados 2 s dice «Preparando…» y lo anuncia', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    await renderView(fakeApi());

    await user.click(screen.getByRole('button', { name: 'Descargar la versión 4' }));
    await act(async () => {
      jest.advanceTimersByTime(PREPARING_DELAY_MS);
    });

    const button = within(itemOf(4)).getByRole('button', { name: 'Descargar la versión 4' });
    expect(button.textContent).toBe('Preparando…');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Preparando la descarga de la versión 4…')).toBeTruthy();
  });

  it('CA-8: si la descarga falla, avisa arriba con «Reintentar»', async () => {
    const tooMany = new StorageRequestError(429, STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS);
    await renderView(fakeApi({ versionDownloadUrl: jest.fn(() => Promise.reject(tooMany)) }));

    await userEvent.click(screen.getByRole('button', { name: 'Descargar la versión 4' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No pudimos preparar la descarga de la versión 4.');
    expect(alert.textContent).toContain('Hiciste demasiadas solicitudes.');
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it.each([360, 1440])(
    'CA-20: sin violaciones de axe a %i px, con el diálogo abierto',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      await renderView(fakeApi());
      await screen.findByText('3 versiones · tu plan Personal conserva 3, contando la actual');
      expect((await axe(document.body)).violations).toEqual([]);

      await userEvent.click(screen.getByRole('button', { name: 'Restaurar la versión 4' }));

      expect((await axe(document.body)).violations).toEqual([]);
    },
  );
});
