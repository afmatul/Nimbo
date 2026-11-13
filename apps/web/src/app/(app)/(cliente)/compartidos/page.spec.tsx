/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';

import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { receivedShare } from '../../../../features/sharing/test-sharing';
import { SpaceProvider } from '../../../../features/storage/components/space-provider';
import { UploadsProvider } from '../../../../features/storage/components/uploads-provider';
import { sidebarApiFake } from '../../../../features/storage/test-sidebar-api';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';
import { jsonResponse } from '../../../../lib/test-http';

import CompartidosPage from './page';

const API = 'http://localhost/api/v1';

function respond(url: string): Promise<Response> {
  return url === `${API}/shares/received`
    ? Promise.resolve(jsonResponse({ entries: [receivedShare()] }))
    : new Promise<Response>(() => undefined);
}

describe('página «Compartidos conmigo» (/compartidos)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn((input: Parameters<typeof fetch>[0]) => respond(String(input)));
  });

  it('CA-8: pide GET /shares/received y muestra lo compartido con su ítem del menú activo', async () => {
    render(
      <SessionProvider apiPublicUrl={API}>
        <UploadsProvider api={sidebarApiFake()}>
          <SpaceProvider
            api={{ spaceSummary: () => Promise.resolve(spaceSummaryWith(3 * GB)) }}
            uploadedCount={0}
          >
            <CompartidosPage />
          </SpaceProvider>
        </UploadsProvider>
      </SessionProvider>,
    );
    await act(async () => undefined);

    expect(screen.getByRole('heading', { level: 1, name: 'Compartidos conmigo' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Informe_trimestral_Q3.docx' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    const current = nav.querySelector('a[aria-current="page"]');
    expect(current?.textContent).toBe('Compartidos');
    expect(current?.getAttribute('href')).toBe('/compartidos');
  });
});
