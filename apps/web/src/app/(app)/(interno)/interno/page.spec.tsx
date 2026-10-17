/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { HeaderAccountProvider } from '../../../../components/nimbo/header-account';
import { SessionAccountMenu } from '../../../../features/identity/components/session-account-menu';
import {
  forgetSession,
  rememberSession,
} from '../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../features/identity/session/test-session';

import InternoPage from './page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const MENU_NAME = 'Menú de la cuenta de Ana López';

/** La página como la arma `(app)/layout`: el menú de la cuenta en la cabecera del marco. */
async function renderPage(role?: RoleName): Promise<HTMLElement> {
  if (role !== undefined) rememberSession(sessionFixture({ role }));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <HeaderAccountProvider account={<SessionAccountMenu />}>
        <InternoPage />
      </HeaderAccountProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

describe('área interna (/interno)', () => {
  beforeEach(() => {
    replace.mockReset();
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    forgetSession();
  });

  it('011 CA-17: Soporte va al inicio de su área, /soporte/metadatos, sin ver el marcador', async () => {
    const container = await renderPage('SUPPORT');

    expect(replace).toHaveBeenCalledWith('/soporte/metadatos');
    expect(container.textContent).toBe('');
  });

  it.each([
    ['ADMIN', 'administrador'],
    ['OPERATOR', 'operador'],
  ] as const)(
    'CA-17: %s ve el marcador de su área dentro del marco interno, sin redirección',
    async (role, label) => {
      await renderPage(role);

      const main = screen.getByRole('main');
      expect(within(main).getByRole('heading', { level: 1, name: 'Área interna' })).toBeTruthy();
      expect(within(main).getByRole('heading', { name: 'Hola, Ana López.' })).toBeTruthy();
      expect(within(main).getByText(`Tu área de ${label} estará disponible pronto.`)).toBeTruthy();
      expect(within(main).queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it.each(['ADMIN', 'OPERATOR'] as const)(
    '011 CA-17: %s llega desde el menú de la cuenta a Seguridad, Mi actividad y Cerrar sesión',
    async (role) => {
      await renderPage(role);

      await userEvent.click(screen.getByRole('button', { name: MENU_NAME }));

      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([
        'Seguridad',
        'Mi actividad',
        'Cerrar sesión',
      ]);
      expect(
        within(menu).getByRole('menuitem', { name: 'Mi actividad' }).getAttribute('href'),
      ).toBe('/interno/actividad');
    },
  );

  it('CA-17: sin sesión no redirige ni dibuja nada (de eso se encarga SessionGate)', async () => {
    const container = await renderPage();

    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it.each(['ADMIN', 'OPERATOR'] as const)(
    'CA-17: el marcador de %s en el marco, sin violaciones de axe a 360 y 1440 px',
    async (role) => {
      const container = await renderPage(role);

      for (const width of [360, 1440]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
        window.dispatchEvent(new Event('resize'));
        const results = await act(async () => axe(container));
        expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
      }
    },
  );
});
