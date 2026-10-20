/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { jsonResponse } from '../../../lib/test-http';
import { forgetSession, rememberSession } from '../session/session-memory';
import { SessionProvider } from '../session/session-provider';
import { sessionFixture } from '../session/test-session';

import { SecurityView } from './security-view';

const API = 'http://localhost/api/v1';

async function renderView(role: RoleName): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl={API}>
      <SecurityView apiPublicUrl={API} />
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

function sidebarLinks(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
  return within(nav)
    .queryAllByRole('link')
    .map((link) => link.textContent ?? '');
}

describe('SecurityView: marco de cada rol (011 CA-17)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve(jsonResponse({ items: [] })));
  });

  afterEach(() => {
    forgetSession();
  });

  it('CA-17: el cliente ve Seguridad en su marco, con Mis Archivos', async () => {
    await renderView('CLIENT');

    expect(sidebarLinks()).toContain('Mis Archivos');
  });

  it.each([
    ['SUPPORT', ['Metadatos de archivos']],
    ['ADMIN', ['Cuentas', 'Catálogo de planes', 'Métricas']],
    ['OPERATOR', ['Métricas']],
  ] as const)(
    'CA-17: %s ve Seguridad dentro del marco interno, con su navegación',
    async (role, links) => {
      await renderView(role);

      const main = screen.getByRole('main');
      expect(within(main).getByRole('heading', { level: 1, name: 'Seguridad' })).toBeTruthy();
      expect(sidebarLinks()).toEqual(links);
      expect(screen.queryByRole('link', { name: 'Mis Archivos' })).toBeNull();
    },
  );

  it.each(['SUPPORT', 'ADMIN', 'OPERATOR'] as const)(
    'CA-17: %s en el marco interno, sin violaciones de axe a 360 y 1440 px',
    async (role) => {
      const container = await renderView(role);

      for (const width of [360, 1440]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
        const results = await act(async () => axe(container));
        expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
      }
    },
  );
});
