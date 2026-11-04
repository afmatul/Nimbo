/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { jsonResponse } from '../../../lib/test-http';
import { SpaceProvider } from '../../storage/components/space-provider';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import { forgetSession, rememberSession } from '../session/session-memory';
import { SessionProvider } from '../session/session-provider';
import { sessionFixture } from '../session/test-session';

import { SecurityView } from './security-view';

const API = 'http://localhost/api/v1';

const spaceSummary = jest.fn(() => Promise.resolve(spaceSummaryWith(3 * GB)));

async function renderView(role: RoleName): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl={API}>
      <SpaceProvider api={{ spaceSummary }} uploadedCount={0}>
        <SecurityView apiPublicUrl={API} />
      </SpaceProvider>
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

  it('CA-17: el cliente ve Seguridad en su marco, con Mis archivos y la tarjeta de espacio', async () => {
    const container = await renderView('CLIENT');

    expect(sidebarLinks()).toContain('Mis archivos');
    expect(container.querySelector('[data-quota-card]')).not.toBeNull();
  });

  it.each([
    ['SUPPORT', ['Metadatos de archivos', 'Papelera']],
    ['ADMIN', ['Cuentas', 'Catálogo de planes', 'Métricas']],
    ['OPERATOR', ['Métricas']],
  ] as const)(
    'CA-17: %s ve Seguridad dentro del marco interno, con su navegación',
    async (role, links) => {
      await renderView(role);

      const main = screen.getByRole('main');
      expect(within(main).getByRole('heading', { level: 1, name: 'Seguridad' })).toBeTruthy();
      expect(sidebarLinks()).toEqual(links);
      expect(screen.queryByRole('link', { name: 'Mis archivos' })).toBeNull();
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
