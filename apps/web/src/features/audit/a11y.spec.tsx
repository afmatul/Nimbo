/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AccountMenu } from '../../components/nimbo/account-menu';
import { HeaderAccountProvider } from '../../components/nimbo/header-account';
import { SessionProvider } from '../identity/session/session-provider';
import { SpaceProvider } from '../storage/components/space-provider';
import { GB, spaceSummaryWith } from '../storage/test-space-summary';

import { ActivityView } from './components/activity-view';
import { ACTIVITY_LABEL, ACTIVITY_PATH } from './routes';
import { activityPage, auditEvent, SUPPORT_RESTORE } from './test-audit-event';

const VIEWPORTS = [360, 1440] as const;
/** Como en `storage/a11y.spec.tsx`: el contenido del menú va en un portal de Radix, fuera de los *landmarks* (`region`, moderada). */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const TRIGGER_NAME = 'Lucía Barrios (menú de la cuenta)';

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

/** «Mi actividad» como la arma `(app)/layout`: el menú de la cuenta en la cabecera del `AppLayout`. */
async function renderActivityPage(): Promise<void> {
  const page = activityPage([SUPPORT_RESTORE, auditEvent()], 'c-2');
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceProvider
        api={{ spaceSummary: () => Promise.resolve(spaceSummaryWith(3 * GB)) }}
        uploadedCount={0}
      >
        <HeaderAccountProvider
          account={
            <AccountMenu
              fullName="Lucía Barrios"
              email="lucia.barrios@gmail.com"
              onSignOut={() => Promise.resolve()}
            />
          }
        >
          <ActivityView load={() => Promise.resolve(page)} />
        </HeaderAccountProvider>
      </SpaceProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
}

async function openAccountMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  screen.getByRole('button', { name: TRIGGER_NAME }).focus();
  await user.keyboard('{Enter}');
  return user;
}

describe('Accesibilidad de «Mi actividad» y su entrada en el menú de la cuenta (CA-15)', () => {
  beforeAll(() => {
    document.documentElement.lang = 'es';
    document.title = 'Mi actividad · Nimbo';
  });

  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  it('CA-15: con el menú de la cuenta abierto, sin violaciones de axe a 360 y 1440 px', async () => {
    await renderActivityPage();
    await openAccountMenu();

    for (const width of VIEWPORTS) {
      setViewport(width);
      const results = await act(async () => axe(document.body));
      const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
      expect({ width, violations: blocking }).toEqual({ width, violations: [] });
    }
  });

  it('CA-15: con el teclado, Enter abre el menú y la flecha llega a «Mi actividad», que lleva a la página', async () => {
    await renderActivityPage();

    const user = await openAccountMenu();
    await user.keyboard('{ArrowDown}');

    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: ACTIVITY_LABEL });
    expect(document.activeElement).toBe(item);
    expect(item.getAttribute('href')).toBe(ACTIVITY_PATH);
  });

  it('CA-15: al entrar no se roba el foco; Tab pasa por la cuenta y entra al contenido por el origen', async () => {
    await renderActivityPage();
    const user = userEvent.setup();
    const main = screen.getByRole('main');

    expect(document.activeElement).toBe(document.body);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Mi actividad',
    ]);
    const visited: Element[] = [];
    while (!main.contains(document.activeElement)) {
      await user.tab();
      visited.push(document.activeElement as Element);
    }

    expect(visited).toContain(screen.getByRole('button', { name: TRIGGER_NAME }));
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Todo' }));
  });
});
