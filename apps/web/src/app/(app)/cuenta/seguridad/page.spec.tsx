/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROLES, type RoleName, type SessionSummary } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SessionGate } from '../../../../features/identity/session/session-gate';
import {
  forgetSession,
  rememberSession,
} from '../../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../../features/identity/session/test-session';
import { jsonResponse } from '../../../../lib/test-http';

import SeguridadPage from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const API = 'http://localhost/api/v1';
const NO_CONTENT = 204;
const COMPONENTS_DIR = join(__dirname, '../../../../features/identity/components');
const SESSIONS_SPEC = 'sessions-card.spec.tsx';
const PASSWORD_SPEC = 'change-password-form.spec.tsx';
const MOCKUP_STATE_COUNT = 15;

const CURRENT: SessionSummary = {
  id: '00000000-0000-4000-8000-000000000001',
  browser: 'Chrome',
  os: 'Windows',
  deviceKind: 'desktop',
  startedAt: '2026-09-24T15:00:00.000Z',
  lastActiveAt: '2026-09-26T15:00:00.000Z',
  current: true,
};
const SAFARI: SessionSummary = {
  ...CURRENT,
  id: '00000000-0000-4000-8000-000000000002',
  browser: 'Safari',
  os: 'iOS',
  deviceKind: 'mobile',
  current: false,
};

/**
 * Los 15 estados del mockup de Seguridad (README de `mockups/identity/seguridad`) y la prueba de componente que cubre
 * cada uno (T-99, T-100 y T-101). La página solo compone las dos tarjetas; esta tabla evita que un estado se pierda.
 */
const MOCKUP_STATES: readonly {
  readonly state: string;
  readonly file: string;
  readonly test: string;
}[] = [
  {
    state: 'default (sesiones)',
    file: SESSIONS_SPEC,
    test: 'CA-11: la actual va primero con «Este dispositivo»',
  },
  {
    state: 'default (contraseña)',
    file: PASSWORD_SPEC,
    test: 'CA-22: default con la advertencia, los tres campos',
  },
  {
    state: 'cargando',
    file: SESSIONS_SPEC,
    test: 'CA-11: mientras carga anuncia «Cargando tus sesiones…»',
  },
  {
    state: 'error-sesiones',
    file: SESSIONS_SPEC,
    test: 'CA-11: si la lista no carga, muestra el genérico',
  },
  {
    state: 'sin-otras-sesiones',
    file: SESSIONS_SPEC,
    test: 'CA-11: solo la actual: nota de «sin otras sesiones»',
  },
  { state: 'confirmar-cierre', file: SESSIONS_SPEC, test: 'CA-12: cerrar una pide confirmación' },
  {
    state: 'confirmar-cierre-actual',
    file: SESSIONS_SPEC,
    test: 'CA-14: cerrar la actual pide confirmación',
  },
  {
    state: 'sesion-cerrada',
    file: SESSIONS_SPEC,
    test: 'CA-12: al confirmar la cierra, la quita de la lista',
  },
  {
    state: 'cerrar-demas',
    file: SESSIONS_SPEC,
    test: 'CA-13: «Cerrar las demás sesiones» confirma el número',
  },
  {
    state: 'cerrar-demas-exito',
    file: SESSIONS_SPEC,
    test: 'CA-13: con una sola sesión más, la confirmación y el resultado',
  },
  {
    state: 'contrasena-enviando',
    file: PASSWORD_SPEC,
    test: 'CA-22: contrasena-enviando muestra el progreso',
  },
  {
    state: 'contrasena-no-coincide',
    file: PASSWORD_SPEC,
    test: 'CA-22: contrasena-no-coincide no envía',
  },
  {
    state: 'contrasena-incorrecta',
    file: PASSWORD_SPEC,
    test: 'CA-23: contrasena-incorrecta vacía la actual',
  },
  {
    state: 'contrasena-debil',
    file: PASSWORD_SPEC,
    test: 'CA-22: contrasena-debil marca la nueva',
  },
  {
    state: 'contrasena-bloqueada',
    file: PASSWORD_SPEC,
    test: 'CA-23: contrasena-bloqueada muestra los minutos',
  },
  {
    state: 'contrasena-cambiada',
    file: PASSWORD_SPEC,
    test: 'CA-22: contrasena-cambiada envía solo la actual',
  },
];

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

/** API falsa: la lista de sesiones y `204` para cerrar, cerrar sesión y cambiar la contraseña. */
function serveSessions(items: readonly SessionSummary[]): void {
  fetchMock.mockImplementation((input) =>
    Promise.resolve(
      String(input).endsWith('/sessions')
        ? jsonResponse({ items })
        : jsonResponse(undefined, NO_CONTENT),
    ),
  );
}

function sessionListCalls(): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/sessions')).length;
}

async function renderPage(role: RoleName = 'CLIENT'): Promise<ReturnType<typeof render>> {
  rememberSession(sessionFixture({ role }));
  const view = render(
    <SessionProvider apiPublicUrl={API}>
      <SessionGate>{SeguridadPage()}</SessionGate>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return view;
}

function sessionsCard(): HTMLElement {
  return screen.getByRole('region', { name: /Sesiones activas/ });
}

beforeEach(() => {
  process.env['APP_ENV'] = 'test';
  process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
  process.env['API_PUBLIC_URL'] = API;
  fetchMock.mockReset();
  replace.mockReset();
  global.fetch = fetchMock;
  serveSessions([CURRENT, SAFARI]);
});

afterEach(() => {
  forgetSession();
});

describe('página Seguridad (/cuenta/seguridad)', () => {
  it('CA-11, CA-22: encabezado y dos tarjetas, «Sesiones activas» con la lista y «Cambiar contraseña»', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Seguridad' })).toBeTruthy();
    expect(
      screen.getByText('Revisa dónde está abierta tu cuenta y cambia tu contraseña.'),
    ).toBeTruthy();
    expect(within(sessionsCard()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Cambiar contraseña' })).toBeTruthy();
  });

  it.each(ROLES)(
    'CA-11: el rol %s llega a sus propias sesiones y al cambio de contraseña',
    async (role) => {
      await renderPage(role);

      expect(within(sessionsCard()).getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByRole('region', { name: 'Cambiar contraseña' })).toBeTruthy();
      expect(screen.queryAllByRole('link', { name: 'Mis Archivos' }).length > 0).toBe(
        role === 'CLIENT',
      );
    },
  );

  it('CA-22: tras cambiar la contraseña vuelve a pedir la lista de sesiones', async () => {
    await renderPage();
    const user = userEvent.setup();
    const password = 'Nimbo-Seguro-2026';

    await user.type(screen.getByLabelText('Contraseña actual'), 'Lucia-Alpha-2025');
    await user.type(screen.getByLabelText('Contraseña nueva'), password);
    await user.type(screen.getByLabelText('Confirma la contraseña nueva'), password);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => expect(sessionListCalls()).toBe(2));
    expect(screen.getByText('Cambiamos tu contraseña y cerramos tus otras sesiones.')).toBeTruthy();
  });

  it('CA-12: cerrar otra sesión llama a la API con el token y la quita de la lista', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión en Safari · iOS' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cerrar sesión' }),
    );

    await waitFor(() => expect(within(sessionsCard()).getAllByRole('listitem')).toHaveLength(1));
    const [url, init] =
      fetchMock.mock.calls.find(([, options]) => options?.method === 'DELETE') ?? [];
    expect(String(url)).toBe(`${API}/sessions/${SAFARI.id}`);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-de-acceso');
  });

  it('CA-14: cerrar la sesión actual desde la lista lleva a /iniciar-sesion', async () => {
    await renderPage();

    await userEvent.click(
      screen.getByRole('button', { name: 'Cerrar sesión en este dispositivo' }),
    );
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cerrar sesión' }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/iniciar-sesion'));
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/auth/session/logout')),
    ).toBe(true);
  });

  it('CA-27: la tabla enumera los 15 estados del mockup de Seguridad', () => {
    const states = new Set(MOCKUP_STATES.map(({ state }) => state.split(' ')[0]));
    expect(states.size).toBe(MOCKUP_STATE_COUNT);
  });

  it.each(MOCKUP_STATES)(
    'CA-27: el estado $state del mockup lo cubre «$test…»',
    ({ file, test }) => {
      expect(readFileSync(join(COMPONENTS_DIR, file), 'utf8')).toContain(`it('${test}`);
    },
  );

  it('CA-27: la página no tiene violaciones de accesibilidad (jest-axe)', async () => {
    const { container } = await renderPage();

    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
