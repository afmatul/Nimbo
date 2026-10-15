/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';

import { activityPage, SUPPORT_RESTORE } from '../../../../features/audit/test-audit-event';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { SpaceProvider } from '../../../../features/storage/components/space-provider';
import { GB, spaceSummaryWith } from '../../../../features/storage/test-space-summary';
import { jsonResponse } from '../../../../lib/test-http';

import ActividadPage from './page';

const API = 'http://localhost/api/v1';

function respond(url: string): Promise<Response> {
  return url.startsWith(`${API}/audit/my-events`)
    ? Promise.resolve(jsonResponse(activityPage([SUPPORT_RESTORE])))
    : new Promise<Response>(() => undefined);
}

describe('página Mi actividad (/actividad)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn((input: Parameters<typeof fetch>[0]) => respond(String(input)));
  });

  it('CA-15: pide GET /audit/my-events y muestra la actividad de la cuenta', async () => {
    render(
      <SessionProvider apiPublicUrl={API}>
        <SpaceProvider
          api={{ spaceSummary: () => Promise.resolve(spaceSummaryWith(3 * GB)) }}
          uploadedCount={0}
        >
          <ActividadPage />
        </SpaceProvider>
      </SessionProvider>,
    );
    await act(async () => undefined);

    expect(screen.getByRole('heading', { level: 1, name: 'Mi actividad' })).toBeTruthy();
    expect(await screen.findByText('Soporte de Nimbo restauró 3 elementos')).toBeTruthy();
    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${API}/audit/my-events`);
  });
});
