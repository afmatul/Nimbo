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

  it('CA-14, CA-17: el Administrador ve Cuentas, Catálogo de planes y Métricas', () => {
    expect(navOf('ADMIN')).toEqual([
      ['Cuentas', '/admin/cuentas'],
      ['Catálogo de planes', '/admin/planes'],
      ['Métricas', '/admin/metricas'],
    ]);
  });

  it('CA-14, CA-17: el Operador ve solo Métricas, en su área (hasta la 022b)', () => {
    expect(navOf('OPERATOR')).toEqual([['Métricas', '/operacion/metricas']]);
  });

  it('CA-17: el cliente no tiene entradas en el área interna', () => {
    expect(navOf('CLIENT')).toEqual([]);
  });

  it('018 CA-14: ningún rol interno recibe «Buscar»', () => {
    for (const role of ['ADMIN', 'SUPPORT', 'OPERATOR'] as const) {
      expect(navOf(role).map(([, href]) => href)).not.toContain('/buscar');
    }
  });

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

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)(
    '020b CA-18: %s no ve «Agente Nimbo» ni el panel del agente',
    async (role) => {
      await renderLayout(role);

      expect(screen.queryByText('Agente Nimbo')).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Agente Nimbo' })).toBeNull();
    },
  );

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

  it('CA-17: el marco del Operador, sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderLayout('OPERATOR', '/operacion/metricas');

    for (const width of VIEWPORTS) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.dispatchEvent(new Event('resize'));
      const results = await act(async () => axe(container));
      expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
    }
  });
});
