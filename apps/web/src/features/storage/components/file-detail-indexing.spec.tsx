/**
 * @jest-environment jsdom
 */
import {
  INDEXING_EVENTS,
  STORAGE_ERROR_CODES,
  type IndexingStatusResponse,
} from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FakeRealtimeChannel } from '../../editing/test-edit-session';
import { forgetSession, rememberSession } from '../../identity/session/session-memory';
import { SessionProvider } from '../../identity/session/session-provider';
import { sessionFixture } from '../../identity/session/test-session';
import type { IndexingApi } from '../../intelligence/indexing-api';
import {
  FAILED,
  fakeIndexingApi,
  INDEXED_FILE_ID,
  INDEXING,
  indexingStatus,
  NOT_INDEXED_TYPE,
} from '../../intelligence/test-indexing';
import { fakeOptimizerApi } from '../../optimizer/test-optimization';
import { RealtimeContext } from '../../realtime/use-realtime';
import { fakeSharingApi } from '../../sharing/test-sharing';
import type { StorageApi } from '../api';
import { StorageRequestError } from '../storage-request-error';
import { GB, spaceSummaryWith } from '../test-space-summary';
import { versionFixture, VERSIONED_FILE } from '../test-versions';

import { FileDetailView } from './file-detail-view';
import { UploadsSpaceProvider } from './space-provider';
import { UploadsProvider } from './uploads-provider';

const CURRENT = versionFixture({ number: 5, isCurrent: true });
const HISTORY = { file: VERSIONED_FILE, items: [CURRENT], retainedVersions: 3 };

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function storageApi(overrides: Partial<StorageApi> = {}): StorageApi {
  return {
    init: jest.fn(() => never()),
    trashSummary: jest.fn(() =>
      Promise.resolve({ itemCount: 0, totalBytes: 0, retentionDays: 60 }),
    ),
    quickAccess: jest.fn(() => Promise.resolve({ pinned: [], recent: [], hasMoreRecent: false })),
    spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))),
    fileVersions: jest.fn(() => Promise.resolve(HISTORY)),
    fileDetail: jest.fn(() =>
      Promise.reject(new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)),
    ),
    ...overrides,
  } as unknown as StorageApi;
}

function statusApi(...responses: IndexingStatusResponse[]): jest.Mocked<IndexingApi> {
  const status = jest.fn<Promise<IndexingStatusResponse>, [string]>();
  responses.forEach((response) => status.mockResolvedValueOnce(response));
  return fakeIndexingApi({ status });
}

async function renderView(
  indexingApi: IndexingApi,
  channel = new FakeRealtimeChannel(),
  api = storageApi(),
): Promise<void> {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <RealtimeContext.Provider value={channel}>
        <UploadsProvider api={api}>
          <UploadsSpaceProvider>
            <FileDetailView
              fileId={INDEXED_FILE_ID}
              indexingApi={indexingApi}
              optimizerApi={fakeOptimizerApi()}
              sharingApi={fakeSharingApi()}
            />
          </UploadsSpaceProvider>
        </UploadsProvider>
      </RealtimeContext.Provider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

function indexingDetail(): string | null | undefined {
  const details = screen.getByRole('region', { name: 'Detalles' });
  return within(details).queryByText('Indexación')?.nextElementSibling?.textContent;
}

describe('FileDetailView: estado de indexación en la ficha (019 CA-13, CA-14)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
    rememberSession(sessionFixture());
  });

  afterEach(() => forgetSession());

  it('CA-14: chip, aviso y fila «Indexación» del estado leído', async () => {
    const indexingApi = statusApi(INDEXING);
    await renderView(indexingApi);

    expect(indexingApi.status).toHaveBeenCalledWith(INDEXED_FILE_ID);
    expect(screen.getByText('Indexando…')).toBeTruthy();
    expect(screen.getByText('Indexando… ya puedes seguir trabajando.')).toBeTruthy();
    expect(indexingDetail()).toBe('En curso · versión 5');
  });

  it('CA-14: al terminar mientras la miro, cambia sin recargar y avisa con el nombre', async () => {
    const channel = new FakeRealtimeChannel();
    await renderView(statusApi(INDEXING, indexingStatus()), channel);

    act(() =>
      channel.emit(INDEXING_EVENTS.STATUS_CHANGED, {
        fileId: INDEXED_FILE_ID,
        state: 'indexado',
        reason: null,
      }),
    );

    expect(screen.getByText('Indexado')).toBeTruthy();
    expect(
      await screen.findByText('Listo para consultar con el agente: Informe_avance_sep.docx.'),
    ).toBeTruthy();
    expect(screen.queryByText('Indexando… ya puedes seguir trabajando.')).toBeNull();
    await waitFor(() => expect(indexingDetail()).toMatch(/· versión 5$/));
  });

  it('CA-13: «Reintentar» vuelve a `pendiente` y deja el foco en el aviso', async () => {
    const indexingApi = statusApi(FAILED);
    indexingApi.retry.mockResolvedValue({ state: 'pendiente' });
    await renderView(indexingApi);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(indexingApi.retry).toHaveBeenCalledWith(INDEXED_FILE_ID);
    expect(await screen.findByText('Indexando… ya puedes seguir trabajando.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reintent/ })).toBeNull();
    expect(document.activeElement?.textContent).toContain('Indexando…');
  });

  it('CA-6: un tipo que no se indexa no muestra chip, aviso ni fila', async () => {
    await renderView(statusApi(NOT_INDEXED_TYPE));

    expect(screen.queryByText(/Estado de indexación/)).toBeNull();
    expect(indexingDetail()).toBeUndefined();
  });

  it('CA-18: un archivo no encontrado solo muestra el estado existente', async () => {
    const gone = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);
    const api = storageApi({ fileVersions: jest.fn(() => Promise.reject(gone)) });
    await renderView(statusApi(FAILED), new FakeRealtimeChannel(), api);

    expect(await screen.findByText('No encontramos este archivo.')).toBeTruthy();
    expect(screen.queryByText('No se pudo indexar')).toBeNull();
  });

  it.each([360, 1440])('sin violaciones de axe a %i px con «Reintentar»', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    await renderView(statusApi(FAILED));
    await screen.findByRole('button', { name: 'Reintentar' });

    expect((await axe(document.body)).violations).toEqual([]);
  });
});
