/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { activityPage, auditEvent } from '../../../../../features/audit/test-audit-event';
import {
  forgetSession,
  rememberSession,
} from '../../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../../lib/test-http';

import InternoActividadPage from './page';

const API = 'http://localhost/api/v1';
const OWN_LOGIN = auditEvent({ actorRole: 'SUPPORT', resourceType: null, sizeBytes: null });

function requestedUrls(): string[] {
  return jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
}

async function renderPage(role: RoleName = 'SUPPORT'): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl={API}>{InternoActividadPage()}</SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

describe('Mi actividad en el área interna (/interno/actividad)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = API;
    global.fetch = jest.fn((input: Parameters<typeof fetch>[0]) =>
      String(input).startsWith(`${API}/audit/my-events`)
        ? Promise.resolve(jsonResponse(activityPage([OWN_LOGIN])))
        : new Promise<Response>(() => undefined),
    );
  });

  afterEach(() => {
    forgetSession();
  });

  it('CA-17: pide su propia bitácora a GET /audit/my-events dentro del marco interno', async () => {
    await renderPage();

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Mi actividad' })).toBeTruthy();
    expect(requestedUrls()).toContain(`${API}/audit/my-events`);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Metadatos de archivos' })).toBeTruthy();
  });

  it('CA-17: no pide el resumen de espacio del cliente ni muestra su navegación', async () => {
    await renderPage();

    expect(requestedUrls().some((url) => url.endsWith('/storage/summary'))).toBe(false);
    expect(screen.queryByRole('link', { name: 'Mis Archivos' })).toBeNull();
  });

  it.each(['SUPPORT', 'ADMIN', 'OPERATOR'] as const)(
    'CA-17: %s, sin violaciones de axe a 360 y 1440 px',
    async (role) => {
      const container = await renderPage(role);
      await screen.findByRole('list', { name: 'Eventos, del más reciente al más antiguo' });

      for (const width of [360, 1440]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
        const results = await act(async () => axe(container));
        expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
      }
    },
  );
});
