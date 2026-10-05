/**
 * @jest-environment jsdom
 */
import type { SessionListResponse, SessionSummary } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ApiClientError } from '../../../lib/api-error';

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
    render(<SessionsCard loadSessions={() => pending} />);

    expect(textOf(screen.getByRole('status'))).toBe('Cargando tus sesiones…');
    expect(screen.getByRole('region', { name: /Sesiones activas/ }).getAttribute('aria-busy')).toBe(
      'true',
    );
    await act(async () => resolve({ items: [CURRENT] }));
  });

  it('CA-11: la actual va primero con «Este dispositivo»; navegador · sistema, actividad e inicio', async () => {
    render(<SessionsCard loadSessions={loaderOf([SAFARI, CURRENT])} />);

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
    render(<SessionsCard loadSessions={loaderOf([CURRENT, SAFARI])} />);

    await waitFor(() => expect(sessionItems()).toHaveLength(2));
    for (const item of sessionItems()) {
      expect(item.querySelector('svg[data-device-icon]')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByRole('button', { name: 'Cerrar sesión en este dispositivo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión en Safari · iOS' })).toBeTruthy();
  });

  it('CA-11: solo la actual: nota de «sin otras sesiones» y sin «Cerrar las demás sesiones»', async () => {
    render(<SessionsCard loadSessions={loaderOf([CURRENT])} />);

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
    render(<SessionsCard loadSessions={loadSessions} />);

    const alert = textOf(await screen.findByRole('alert'));
    expect(alert).toContain('No pudimos cargar tus sesiones.');
    expect(alert).toContain(CORRELATION_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(sessionItems()).toHaveLength(1));
    expect(loadSessions).toHaveBeenCalledTimes(2);
  });

  it('CA-27: la lista no tiene violaciones de accesibilidad (jest-axe)', async () => {
    const { container } = render(<SessionsCard loadSessions={loaderOf([CURRENT, SAFARI])} />);

    await waitFor(() => expect(sessionItems()).toHaveLength(2));
    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
