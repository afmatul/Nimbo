/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { forgetSession, rememberSession } from '../../identity/session/session-memory';
import { SessionProvider } from '../../identity/session/session-provider';
import { sessionFixture } from '../../identity/session/test-session';

import { InternalAreaLayout, internalNavFor } from './internal-area-layout';

const VIEWPORTS = [360, 1440] as const;

function navOf(role: RoleName): readonly (readonly [string, string])[] {
  return internalNavFor(role).map((item) => [item.label, item.href] as const);
}

async function renderLayout(role: RoleName, activeHref?: string): Promise<HTMLElement> {
  rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <InternalAreaLayout {...(activeHref === undefined ? {} : { activeHref })}>
        <h1>Contenido del área</h1>
      </InternalAreaLayout>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

function desktopNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navegación principal' });
}

describe('internalNavFor (011 CA-17)', () => {
  it('CA-14, CA-17: Soporte ve solo Metadatos de archivos', () => {
    expect(navOf('SUPPORT')).toEqual([['Metadatos de archivos', '/soporte/metadatos']]);
  });

  it.each(['ADMIN', 'OPERATOR', 'CLIENT'] as const)(
    'CA-17: %s no tiene entradas mientras no existan sus páginas (llegan en T-11/T-13)',
    (role) => {
      expect(navOf(role)).toEqual([]);
    },
  );

  it('CA-17: marca la entrada activa solo en su página', () => {
    const active = internalNavFor('SUPPORT', '/soporte/metadatos');
    const elsewhere = internalNavFor('SUPPORT');

    expect(active.map((item) => item.active)).toEqual([true]);
    expect(elsewhere.map((item) => item.active)).toEqual([false]);
  });
});

describe('InternalAreaLayout (011 CA-17)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    forgetSession();
  });

  it('CA-17: muestra el contenido dentro del marco con la navegación del rol y sin la del cliente', async () => {
    await renderLayout('SUPPORT', '/soporte/metadatos');

    expect(within(screen.getByRole('main')).getByText('Contenido del área')).toBeTruthy();
    const links = within(desktopNav()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Metadatos de archivos']);
    expect(screen.queryByRole('link', { name: 'Mis Archivos' })).toBeNull();
  });

  it('CA-17: al pie de la barra dice quién es y con qué rol', async () => {
    await renderLayout('ADMIN');

    const persona = screen.getByLabelText('Tu cuenta');
    expect(persona.textContent).toContain('Ana López');
    expect(persona.textContent).toContain('Administrador');
  });

  it('CA-17: sin sesión no dibuja nada (de eso se encarga SessionGate)', () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    const { container } = render(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <InternalAreaLayout>
          <p>Contenido del área</p>
        </InternalAreaLayout>
      </SessionProvider>,
    );

    expect(container.textContent).toBe('');
  });

  it('CA-17: con la barra vacía (Operador), sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderLayout('OPERATOR');

    for (const width of VIEWPORTS) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.dispatchEvent(new Event('resize'));
      const results = await act(async () => axe(container));
      expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
    }
  });
});
