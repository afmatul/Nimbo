/**
 * @jest-environment jsdom
 */
import type { FileSummary, PreviewUrlResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { SessionProvider } from '../../../../../../features/identity/session/session-provider';
import type { StorageApi } from '../../../../../../features/storage/api';
import { UploadsSpaceProvider } from '../../../../../../features/storage/components/space-provider';
import { UploadsProvider } from '../../../../../../features/storage/components/uploads-provider';
import { GB, spaceSummaryWith } from '../../../../../../features/storage/test-space-summary';
import { jsonResponse } from '../../../../../../lib/test-http';

import VistaPreviaPage from './page';

const API = 'http://localhost/api/v1';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const FOLDER_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const NOTAS: FileSummary = {
  id: FILE_ID,
  name: 'Notas.md',
  kind: 'texto',
  folderId: FOLDER_ID,
  sizeBytes: 100,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};
const DELIVERY: PreviewUrlResponse = {
  file: NOTAS,
  url: 'https://objetos.test/privado?X-Amz-Signature=FIRMA',
  expiresAt: '2026-10-10T10:05:00.000Z',
};

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Lo que la ruta usa de storage: la cuota, la Papelera y los accesos rápidos de la barra (006 CA-27). */
function fakeApi(): jest.Mocked<StorageApi> {
  return {
    spaceSummary: jest.fn(() => Promise.resolve(spaceSummaryWith(4.8 * GB))),
    trashSummary: jest.fn(() =>
      Promise.resolve({ itemCount: 2, totalBytes: 0, retentionDays: 60 }),
    ),
    quickAccess: jest.fn(() =>
      Promise.resolve({
        pinned: [{ type: 'folder', id: FOLDER_ID, name: 'Proyecto Alpha' }],
        recent: [],
        hasMoreRecent: false,
      }),
    ),
    recordRecent: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<StorageApi>;
}

async function renderPreview(api: StorageApi = fakeApi()): Promise<HTMLElement> {
  const page = await VistaPreviaPage({ params: Promise.resolve({ fileId: FILE_ID }) });
  const { container } = render(
    <SessionProvider apiPublicUrl={API}>
      <UploadsProvider api={api}>
        <UploadsSpaceProvider>{page}</UploadsSpaceProvider>
      </UploadsProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

function previewRequests(): readonly (readonly [string, RequestInit | undefined])[] {
  return jest
    .mocked(global.fetch)
    .mock.calls.map(([url, init]) => [String(url), init] as const)
    .filter(([url]) => url.endsWith('/preview-url'));
}

describe('ruta de vista previa (/archivos/vista-previa/[fileId])', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000/api/v1';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn(() => never<Response>());
  });

  it('017 P-3, CA-9: monta el visor dentro del layout de la app, con un solo main y la cuota', async () => {
    await renderPreview();

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Vista previa' })).toBeTruthy();
    expect(within(main).getByRole('region', { name: 'Vista previa' })).toBeTruthy();
    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('region', { name: 'Almacenamiento' })).toBeTruthy();
    // 006 CA-27: «Accesos rápidos» y el contador de la Papelera, como en el resto de pantallas del Cliente.
    expect(within(sidebar).getByText('Accesos rápidos')).toBeTruthy();
    expect(within(sidebar).getByRole('link', { name: 'Proyecto Alpha, carpeta' })).toBeTruthy();
    expect(within(sidebar).getByRole('link', { name: /Papelera/ }).textContent).toContain('2');
  });

  it('017 CA-3: pide la URL de vista previa del archivo de la ruta a API_PUBLIC_URL', async () => {
    await renderPreview();

    expect(previewRequests()).toEqual([
      [`${API}/files/${FILE_ID}/preview-url`, expect.objectContaining({ method: 'POST' })],
    ]);
  });

  it('017 CA-7: con la entrega, «Volver» abre la carpeta del archivo con su fila como objetivo de foco', async () => {
    jest
      .mocked(global.fetch)
      .mockImplementation((input) =>
        String(input).endsWith('/preview-url')
          ? Promise.resolve(jsonResponse(DELIVERY))
          : never<Response>(),
      );
    const api = fakeApi();
    await renderPreview(api);

    expect(await screen.findByRole('heading', { level: 1, name: 'Notas.md' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${FOLDER_ID}?foco=${FILE_ID}`,
    );
    // 006 CA-27: previsualizar cuenta como abrir: el archivo pasa a «Recientes» y la barra relee.
    expect(api.recordRecent).toHaveBeenCalledWith('file', FILE_ID);
    expect(api.quickAccess.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('017 CA-9: no tiene violaciones de accesibilidad', async () => {
    const container = await renderPreview();

    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
