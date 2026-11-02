/** @jest-environment jsdom */
import type { FileVersionsResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { dayLabel } from '../../../lib/format-date';
import { forgetSession, rememberSession } from '../../identity/session/session-memory';
import { SessionProvider } from '../../identity/session/session-provider';
import { sessionFixture } from '../../identity/session/test-session';
import { fakeIndexingApi } from '../../intelligence/test-indexing';
import type { OptimizerApi } from '../../optimizer/optimizer-api';
import {
  COMPLETED,
  fakeOptimizerApi,
  IMAGE_FILE_ID,
  optimizationStatus,
  OPTIMIZING,
} from '../../optimizer/test-optimization';
import type { StorageApi } from '../api';
import { spaceSummaryWith } from '../test-space-summary';
import { versionFixture } from '../test-versions';

import { FileDetailView } from './file-detail-view';
import { UploadsSpaceProvider } from './space-provider';
import { UploadsProvider } from './uploads-provider';

const ORIGINAL = versionFixture({ number: 1, isCurrent: true, sizeBytes: 4_800_000 });
const OPTIMIZED = versionFixture({
  number: 2,
  isCurrent: true,
  sizeBytes: 2_900_000,
  origin: 'optimizacion',
  deltaBytes: '-1900000',
});
const KEPT_UNTIL = '2027-01-15T16:00:00.000Z';
const HISTORY: FileVersionsResponse = {
  file: { name: 'Foto_inventario.jpg', kind: 'imagen', folderId: null },
  items: [ORIGINAL],
  retainedVersions: 3,
};
const KEPT = { ...ORIGINAL, isCurrent: false, keptUntil: KEPT_UNTIL };
const AFTER_OPTIMIZATION = { ...HISTORY, items: [OPTIMIZED, KEPT] };
const RESTORED = versionFixture({
  number: 3,
  isCurrent: true,
  origin: 'restauracion',
  restoredFromNumber: 1,
  sizeBytes: 4_800_000,
});
const AFTER_RESTORE = {
  ...HISTORY,
  items: [RESTORED, { ...OPTIMIZED, isCurrent: false }, KEPT],
};
function storageApi(history = HISTORY): jest.Mocked<StorageApi> {
  return {
    init: jest.fn(() => new Promise(() => undefined)),
    trashSummary: jest.fn().mockResolvedValue({ itemCount: 0, totalBytes: 0, retentionDays: 7 }),
    quickAccess: jest.fn().mockResolvedValue({ pinned: [], recent: [], hasMoreRecent: false }),
    spaceSummary: jest.fn().mockResolvedValue(spaceSummaryWith(4_800_000)),
    fileVersions: jest.fn().mockResolvedValue(history),
  } as unknown as jest.Mocked<StorageApi>;
}
async function renderView(api: StorageApi, optimizerApi: OptimizerApi): Promise<RenderResult> {
  const view = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <UploadsProvider api={api}>
        <UploadsSpaceProvider>
          <FileDetailView
            fileId={IMAGE_FILE_ID}
            indexingApi={fakeIndexingApi()}
            optimizerApi={optimizerApi}
          />
        </UploadsSpaceProvider>
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return view;
}

function restorationFixture() {
  const api = storageApi(AFTER_OPTIMIZATION);
  api.fileVersions.mockResolvedValueOnce(AFTER_OPTIMIZATION).mockResolvedValue(AFTER_RESTORE);
  api.restoreVersion = jest.fn().mockResolvedValue(RESTORED);
  api.spaceSummary.mockResolvedValue(spaceSummaryWith(7_700_000));
  const optimizer = fakeOptimizerApi({
    status: jest.fn().mockResolvedValueOnce(COMPLETED).mockResolvedValue(null),
  });
  return { api, optimizer };
}

describe('021: optimización en la ficha existente', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => undefined));
    rememberSession(sessionFixture());
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => {
    forgetSession();
    jest.useRealTimers();
  });

  it.each(['foto.jpg', 'foto.jpeg', 'foto.PNG'])(
    'CA-22: tarjeta antes del historial para %s',
    async (name) => {
      const optimizer = fakeOptimizerApi();
      await renderView(storageApi({ ...HISTORY, file: { ...HISTORY.file, name } }), optimizer);
      const card = screen.getByRole('region', { name: 'Optimizar espacio' });
      const history = screen.getByRole('region', { name: 'Historial de versiones' });
      expect(card.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(optimizer.status).toHaveBeenCalledWith(IMAGE_FILE_ID);
    },
  );

  it.each(['foto.gif', 'foto.webp', 'informe.pdf', 'informe.docx', 'video.mp4', 'otro.bin'])(
    'CA-3: %s sin tarjeta ni peticiones de optimización',
    async (name) => {
      const optimizer = fakeOptimizerApi();
      await renderView(storageApi({ ...HISTORY, file: { ...HISTORY.file, name } }), optimizer);
      expect(screen.queryByRole('region', { name: 'Optimizar espacio' })).toBeNull();
      expect(optimizer.status).not.toHaveBeenCalled();
    },
  );

  it('CA-7, CA-15: completada actualiza ficha, tamaño, historial, marca real, cuota y aviso efímero', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const api = storageApi();
    api.fileVersions.mockResolvedValueOnce(HISTORY).mockResolvedValue({
      ...HISTORY,
      items: [OPTIMIZED, { ...ORIGINAL, isCurrent: false, keptUntil: KEPT_UNTIL }],
    });
    api.spaceSummary
      .mockResolvedValueOnce(spaceSummaryWith(4_800_000))
      .mockResolvedValue(spaceSummaryWith(2_900_000));
    const optimizer = fakeOptimizerApi({
      status: jest.fn().mockResolvedValueOnce(optimizationStatus()).mockResolvedValue(COMPLETED),
    });
    await renderView(api, optimizer);
    await user.click(screen.getByRole('button', { name: 'Optimizar' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Optimizar' }),
    );
    await act(async () => {
      jest.advanceTimersByTime(OPTIMIZING.pollAfterMs ?? 0);
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(api.fileVersions).toHaveBeenCalledTimes(2);
    expect(api.spaceSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2,9 MB · versión 2')).toBeTruthy();
    expect(screen.getByText('2,9 MB de tu espacio')).toBeTruthy();
    expect(
      screen.getByText(`Original conservado hasta ${dayLabel(KEPT_UNTIL)} · no ocupa tu espacio`),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurar la versión 1' })).toBeTruthy();
    expect(screen.getAllByText(/Optimizamos tu imagen: ahorraste/).length).toBeGreaterThanOrEqual(
      2,
    );
    const quota = screen.getByRole('progressbar', { name: 'Almacenamiento' });
    expect(quota.getAttribute('aria-valuetext')).toContain('2,9 MB');
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    // Dos lecturas del trabajo y una revalidación al cambiar la versión activa; sin polling posterior.
    expect(optimizer.status).toHaveBeenCalledTimes(3);
  });

  it('CA-17: reutiliza el banner de 010 y deja Optimizar deshabilitado', async () => {
    const api = storageApi();
    api.spaceSummary.mockResolvedValue({ ...spaceSummaryWith(4_800_000), readOnly: true });
    const optimizer = fakeOptimizerApi({
      status: jest.fn().mockResolvedValue(optimizationStatus()),
    });
    await renderView(api, optimizer);
    expect(screen.getByText('Tu cuenta está en solo lectura.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Optimizar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(optimizer.run).not.toHaveBeenCalled();
  });

  it('CA-1, CA-6, CA-16: restaurar V1 como V3 relee la optimización sin F5 y permite calcular de nuevo', async () => {
    const user = userEvent.setup();
    const { api, optimizer } = restorationFixture();
    await renderView(api, optimizer);
    const card = screen.getByRole('region', { name: 'Optimizar espacio' });
    expect(within(card).getByText(/Optimizamos tu imagen/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Restaurar la versión 1' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar versión 1' }));
    expect(api.restoreVersion).toHaveBeenCalledWith(IMAGE_FILE_ID, ORIGINAL.id);
    expect(optimizer.status).toHaveBeenCalledTimes(2);
    const fresh = screen.getByRole('region', { name: 'Optimizar espacio' });
    expect(within(fresh).queryByText(/Optimizamos tu imagen/)).toBeNull();
    await user.click(await within(fresh).findByRole('button', { name: 'Calcular ahorro' }));
    expect(optimizer.estimate).toHaveBeenCalledWith(IMAGE_FILE_ID);
    for (const number of [1, 2, 3]) {
      expect(
        screen.getByRole('button', { name: `Descargar la versión ${String(number)}` }),
      ).toBeTruthy();
    }
  });

  it('CA-1, CA-6: al reabrir tras F5 sobre V3 usa el estado vigente, no el éxito anterior', async () => {
    const optimizer = fakeOptimizerApi({
      status: jest.fn().mockResolvedValueOnce(COMPLETED).mockResolvedValue(null),
    });
    const previous = await renderView(storageApi(AFTER_OPTIMIZATION), optimizer);
    expect(screen.getByText(/Optimizamos tu imagen/)).toBeTruthy();
    previous.unmount();
    await renderView(storageApi(AFTER_RESTORE), optimizer);
    expect(screen.queryByText(/Optimizamos tu imagen/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Calcular ahorro' }));
    expect(optimizer.estimate).toHaveBeenCalledWith(IMAGE_FILE_ID);
    expect(optimizer.run).not.toHaveBeenCalled();
  });
});
