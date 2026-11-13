/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';

import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { fileHit, searchPage } from '../../../../features/search/test-search-hit';
import { SpaceProvider } from '../../../../features/storage/components/space-provider';
import { UploadsProvider } from '../../../../features/storage/components/uploads-provider';
import { sidebarApiFake } from '../../../../features/storage/test-sidebar-api';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';
import { jsonResponse } from '../../../../lib/test-http';

import BuscarPage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('q=camion'),
}));

const API = 'http://localhost/api/v1';

function respond(url: string): Promise<Response> {
  return url.startsWith(`${API}/search`)
    ? Promise.resolve(jsonResponse(searchPage([fileHit(2, 'Camión_Ventas.docx')])))
    : new Promise<Response>(() => undefined);
}

describe('página de búsqueda (/buscar)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn((input: Parameters<typeof fetch>[0]) => respond(String(input)));
  });

  it('CA-12: la dirección repite la búsqueda: pide GET /search con su texto y muestra los resultados', async () => {
    render(
      <SessionProvider apiPublicUrl={API}>
        <UploadsProvider api={sidebarApiFake()}>
          <SpaceProvider
            api={{ spaceSummary: () => Promise.resolve(spaceSummaryWith(3 * GB)) }}
            uploadedCount={0}
          >
            <BuscarPage />
          </SpaceProvider>
        </UploadsProvider>
      </SessionProvider>,
    );
    await act(async () => undefined);

    expect(screen.getByRole('heading', { level: 1, name: 'Buscar' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Camión_Ventas.docx' })).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/search?q=camion`);
  });
});
