/**
 * @jest-environment jsdom
 */
import type { SessionListResponse, SessionSummary } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ApiClientError } from '../../../lib/api-error';
import type { SessionsActions } from '../hooks/use-sessions-card';

import { SessionsCard } from './sessions-card';

const HOUR_MS = 3_600_000;
const NOW = Date.parse('2026-09-26T15:00:00.000Z');
const CORRELATION_ID = '7f3c9a12-4b6e-4d21-9c0a-2e5f8b1d6a44';
const NO_OTHERS_NOTE =
  'No tienes otras sesiones abiertas. Si inicias sesión en otro navegador o dispositivo, aparecerá aquí.';

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    browser: 'Chrome',
    os: 'Windows',
    deviceKind: 'desktop',
    startedAt: '2026-09-24T15:00:00.000Z',
    lastActiveAt: new Date(NOW).toISOString(),
    current: false,
    ...overrides,
  };
}

const CURRENT = session({ current: true });
const SAFARI = session({
  id: '00000000-0000-4000-8000-000000000002',
  browser: 'Safari',
  os: 'iOS',
  deviceKind: 'mobile',
  startedAt: '2026-09-21T15:00:00.000Z',
  lastActiveAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
});

function loaderOf(items: readonly SessionSummary[]): () => Promise<SessionListResponse> {
  return () => Promise.resolve({ items: [...items] });
}

/** Acciones de prueba: la lista viene de `load`; las demás resuelven sin efecto salvo que se sobrescriban. */
function actionsWith(
  load: SessionsActions['load'],
  overrides: Partial<Omit<SessionsActions, 'load'>> = {},
): SessionsActions {
  return {
    load,
    revoke: jest.fn(() => Promise.resolve()),
    revokeOthers: jest.fn(() => Promise.resolve({ revokedCount: 0 })),
    signOut: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function sessionItems(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Sesiones abiertas' })).getAllByRole('listitem');
}

function textOf(element: HTMLElement | undefined): string {
  return element?.textContent ?? '';
}

function cardTitle(): string {
  return textOf(screen.getByRole('heading', { name: /Sesiones activas/ }));
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SessionsCard: lista', () => {
  it('CA-11: mientras carga anuncia «Cargando tus sesiones…» y la tarjeta queda ocupada', async () => {
    let resolve: (value: SessionListResponse) => void = () => undefined;
    const pending = new Promise<SessionListResponse>((done) => {
      resolve = done;
    });
    render(<SessionsCard actions={actionsWith(() => pending)} />);

    expect(textOf(screen.getByRole('status'))).toBe('Cargando tus sesiones…');
    expect(screen.getByRole('region', { name: /Sesiones activas/ }).getAttribute('aria-busy')).toBe(
      'true',
    );
    await act(async () => resolve({ items: [CURRENT] }));
  });

  it('CA-11: la actual va primero con «Este dispositivo»; navegador · sistema, actividad e inicio', async () => {
    render(<SessionsCard actions={actionsWith(loaderOf([SAFARI, CURRENT]))} />);

    await waitFor(() => expect(sessionItems()).toHaveLength(2));
    const [first, second] = sessionItems().map(textOf);
    expect(first).toContain('Chrome · Windows');
    expect(first).toContain('Este dispositivo');
    expect(first).toContain('Activa ahora');
    expect(first).toMatch(/Iniciada el 24 sept? 2026/);
    expect(second).toContain('Safari · iOS');
    expect(second).not.toContain('Este dispositivo');
    expect(second).toContain('Última actividad: hace 2 horas');
    expect(second).toMatch(/Iniciada el 21 sept? 2026/);
    expect(cardTitle()).toContain('2 abiertas');
    expect(screen.getByRole('button', { name: 'Cerrar las demás sesiones' })).toBeTruthy();
  });

  it('CA-11: el ícono del dispositivo es decorativo y cada botón tiene nombre accesible completo', async () => {
    render(<SessionsCard actions={actionsWith(loaderOf([CURRENT, SAFARI]))} />);

    await waitFor(() => expect(sessionItems()).toHaveLength(2));
    for (const item of sessionItems()) {
      expect(item.querySelector('svg[data-device-icon]')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByRole('button', { name: 'Cerrar sesión en este dispositivo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión en Safari · iOS' })).toBeTruthy();
  });

  it('CA-11: solo la actual: nota de «sin otras sesiones» y sin «Cerrar las demás sesiones»', async () => {
    render(<SessionsCard actions={actionsWith(loaderOf([CURRENT]))} />);

    await waitFor(() => expect(sessionItems()).toHaveLength(1));
    expect(screen.getByText(NO_OTHERS_NOTE)).toBeTruthy();
    expect(cardTitle()).toContain('1 abierta');
    expect(screen.queryByRole('button', { name: 'Cerrar las demás sesiones' })).toBeNull();
  });

  it('CA-11: si la lista no carga, muestra el genérico con el correlationId y «Reintentar» vuelve a pedirla', async () => {
    const loadSessions = jest
      .fn<Promise<SessionListResponse>, []>()
      .mockRejectedValueOnce(
        new ApiClientError({
          code: 'INTERNAL_ERROR',
          message: 'falló',
          correlationId: CORRELATION_ID,
        }),
      )
      .mockResolvedValueOnce({ items: [CURRENT] });
    render(<SessionsCard actions={actionsWith(loadSessions)} />);

    const alert = textOf(await screen.findByRole('alert'));
    expect(alert).toContain('No pudimos cargar tus sesiones.');
    expect(alert).toContain(CORRELATION_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(sessionItems()).toHaveLength(1));
    expect(loadSessions).toHaveBeenCalledTimes(2);
  });

  it('CA-27: la lista no tiene violaciones de accesibilidad (jest-axe)', async () => {
    const { container } = render(
      <SessionsCard actions={actionsWith(loaderOf([CURRENT, SAFARI]))} />,
    );

    await waitFor(() => expect(sessionItems()).toHaveLength(2));
    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});

const FIREFOX = session({
  id: '00000000-0000-4000-8000-000000000003',
  browser: 'Firefox',
  os: 'Linux',
  lastActiveAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
});

function dialog(): HTMLElement {
  return screen.getByRole('alertdialog');
}

async function openAndConfirm(trigger: string, confirm: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: trigger }));
  await userEvent.click(within(dialog()).getByRole('button', { name: confirm }));
}

describe('SessionsCard: acciones', () => {
  it('CA-12: cerrar una pide confirmación y «Cancelar» no la cierra', async () => {
    const actions = actionsWith(loaderOf([CURRENT, SAFARI]));
    render(<SessionsCard actions={actions} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cerrar sesión en Safari · iOS' }),
    );
    expect(within(dialog()).getByRole('heading').textContent).toBe(
      '¿Cerrar la sesión en Safari · iOS?',
    );
    expect(textOf(dialog())).toContain('Ese dispositivo tendrá que iniciar sesión de nuevo.');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(actions.revoke).not.toHaveBeenCalled();
    expect(sessionItems()).toHaveLength(2);
  });

  it('CA-12: al confirmar la cierra, la quita de la lista y lo anuncia con role="status"', async () => {
    const actions = actionsWith(loaderOf([CURRENT, SAFARI]));
    render(<SessionsCard actions={actions} />);

    await openAndConfirm('Cerrar sesión en Safari · iOS', 'Cerrar sesión');

    expect(textOf(await screen.findByRole('status'))).toBe('Cerramos la sesión en Safari · iOS.');
    expect(actions.revoke).toHaveBeenCalledWith(SAFARI.id);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sessionItems().map(textOf)[0]).toContain('Este dispositivo');
    expect(sessionItems()).toHaveLength(1);
    expect(cardTitle()).toContain('1 abierta');
  });

  it('CA-13: «Cerrar las demás sesiones» confirma el número (plural) y deja solo la actual', async () => {
    const revokeOthers = jest.fn(() => Promise.resolve({ revokedCount: 2 }));
    render(
      <SessionsCard
        actions={actionsWith(loaderOf([CURRENT, SAFARI, FIREFOX]), { revokeOthers })}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar las demás sesiones' }));
    expect(within(dialog()).getByRole('heading').textContent).toBe('¿Cerrar las demás sesiones?');
    expect(textOf(dialog())).toContain(
      'Cerraremos 2 sesiones. Esos dispositivos tendrán que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.',
    );
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar 2 sesiones' }));

    expect(textOf(await screen.findByRole('status'))).toBe(
      'Cerramos 2 sesiones. Solo queda abierta la de este dispositivo.',
    );
    expect(revokeOthers).toHaveBeenCalledTimes(1);
    expect(sessionItems()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Cerrar las demás sesiones' })).toBeNull();
  });

  it('CA-13: con una sola sesión más, la confirmación y el resultado van en singular', async () => {
    const revokeOthers = jest.fn(() => Promise.resolve({ revokedCount: 1 }));
    render(<SessionsCard actions={actionsWith(loaderOf([CURRENT, SAFARI]), { revokeOthers })} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar las demás sesiones' }));
    expect(textOf(dialog())).toContain(
      'Cerraremos 1 sesión. Ese dispositivo tendrá que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.',
    );
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar 1 sesión' }));

    expect(textOf(await screen.findByRole('status'))).toBe(
      'Cerramos 1 sesión. Solo queda abierta la de este dispositivo.',
    );
  });

  it('CA-14: cerrar la actual pide confirmación y cierra la sesión de este navegador', async () => {
    const actions = actionsWith(loaderOf([CURRENT, SAFARI]));
    render(<SessionsCard actions={actions} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cerrar sesión en este dispositivo' }),
    );
    expect(within(dialog()).getByRole('heading').textContent).toBe(
      '¿Cerrar la sesión en este dispositivo?',
    );
    expect(textOf(dialog())).toContain('Tendrás que iniciar sesión de nuevo para volver a entrar.');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(actions.signOut).toHaveBeenCalledTimes(1));
    expect(actions.revoke).not.toHaveBeenCalled();
  });

  it('CA-12: si la sesión ya no existe muestra el mensaje de IDENTITY_SESSION_NOT_FOUND y recarga la lista', async () => {
    const load = jest
      .fn<Promise<SessionListResponse>, []>()
      .mockResolvedValueOnce({ items: [CURRENT, SAFARI] })
      .mockResolvedValueOnce({ items: [CURRENT] });
    const revoke = jest.fn(() =>
      Promise.reject(
        new ApiClientError({
          code: 'IDENTITY_SESSION_NOT_FOUND',
          message: 'no existe',
          correlationId: CORRELATION_ID,
        }),
      ),
    );
    render(<SessionsCard actions={actionsWith(load, { revoke })} />);

    await openAndConfirm('Cerrar sesión en Safari · iOS', 'Cerrar sesión');

    expect(textOf(await screen.findByRole('alert'))).toContain(
      'No encontramos esa sesión. Actualiza la lista.',
    );
    await waitFor(() => expect(sessionItems()).toHaveLength(1));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('CA-27: el resultado de cerrar una sesión no tiene violaciones de accesibilidad (jest-axe)', async () => {
    const { container } = render(
      <SessionsCard actions={actionsWith(loaderOf([CURRENT, SAFARI]))} />,
    );

    await openAndConfirm('Cerrar sesión en Safari · iOS', 'Cerrar sesión');
    await screen.findByRole('status');

    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
