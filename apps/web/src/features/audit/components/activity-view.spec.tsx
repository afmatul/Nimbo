/**
 * @jest-environment jsdom
 */
import type { ListAuditEventsQuery, ListAuditEventsResponse } from '@nimbo/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ApiClientError } from '../../../lib/api-error';
import { SessionProvider } from '../../identity/session/session-provider';
import { SpaceProvider } from '../../storage/components/space-provider';
import { GB, spaceSummaryWith } from '../../storage/test-space-summary';
import type { LoadActivity } from '../hooks/use-activity';
import { activityPage, auditEvent, SUPPORT_RESTORE } from '../test-audit-event';

import { ActivityView } from './activity-view';

const OLDER = auditEvent({
  id: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  occurredAt: '2026-09-28T19:20:00.000Z',
  action: 'node.purged',
  resourceType: 'folder',
  itemCount: 2,
  sizeBytes: null,
});

type LoadMock = jest.Mock<Promise<ListAuditEventsResponse>, [ListAuditEventsQuery]>;

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function loadOf(...pages: readonly (ListAuditEventsResponse | Error)[]): LoadMock {
  const load: LoadMock = jest.fn((_query: ListAuditEventsQuery) => never());
  for (const page of pages) {
    load.mockImplementationOnce(() =>
      page instanceof Error ? Promise.reject(page) : Promise.resolve(page),
    );
  }
  return load;
}

async function renderView(load: LoadActivity): Promise<HTMLElement> {
  const spaceSummary = jest.fn(() => Promise.resolve(spaceSummaryWith(3 * GB)));
  const { container } = render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceProvider api={{ spaceSummary }} uploadedCount={0}>
        <ActivityView load={load} />
      </SpaceProvider>
    </SessionProvider>,
  );
  await act(async () => undefined);
  return container;
}

function eventList(): HTMLElement {
  return screen.getByRole('list', { name: 'Eventos, del más reciente al más antiguo' });
}

function rowTitles(): string[] {
  return within(eventList())
    .getAllByRole('listitem')
    .map((row) => row.querySelector('p')?.textContent ?? '');
}

describe('ActivityView («Mi actividad»)', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => never<Response>());
  });

  it('CA-15: mientras llega la primera página anuncia «Cargando tu actividad…» con los filtros', async () => {
    await renderView(loadOf());

    expect(screen.getByRole('heading', { level: 1, name: 'Mi actividad' })).toBeTruthy();
    expect(screen.getByText('Cargando tu actividad…')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Origen' })).toBeTruthy();
  });

  it('CA-7, CA-13: lista del más reciente al más antiguo, con la acción interna visible', async () => {
    await renderView(loadOf(activityPage([SUPPORT_RESTORE, auditEvent(), OLDER])));

    expect(rowTitles()).toEqual([
      'Soporte de Nimbo restauró 3 elementos',
      'Subiste 1 archivo',
      'Eliminaste definitivamente 2 elementos',
    ]);
    expect(screen.getByText('Mostrando 3 eventos, del más reciente al más antiguo')).toBeTruthy();
    expect(screen.getByText('Llegaste al final: no hay actividad más antigua.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('CA-9: «Cargar más» pide con el cursor y conserva lo visible', async () => {
    const load = loadOf(activityPage([auditEvent()], 'c-2'), activityPage([OLDER]));
    await renderView(load);

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(load).toHaveBeenLastCalledWith({ cursor: 'c-2' });
    expect(rowTitles()).toEqual(['Subiste 1 archivo', 'Eliminaste definitivamente 2 elementos']);
    expect(screen.getByText('Mostrando 2 eventos, del más reciente al más antiguo')).toBeTruthy();
  });

  it('CA-15: si «Cargar más» falla, lo cargado sigue y «Reintentar» vuelve a pedir', async () => {
    const load = loadOf(
      activityPage([auditEvent()], 'c-2'),
      new TypeError('Failed to fetch'),
      activityPage([OLDER]),
    );
    await renderView(load);
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    const alert = screen.getByRole('alert');
    expect(rowTitles()).toEqual(['Subiste 1 archivo']);
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(rowTitles()).toHaveLength(2);
  });

  it('CA-11: sin actividad muestra el vacío y oculta los filtros', async () => {
    await renderView(loadOf(activityPage([])));

    expect(screen.getByRole('heading', { name: 'Aún no hay actividad en tu cuenta' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Origen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('CA-10: sin resultados con filtros ofrece un solo «Limpiar filtros», que vuelve a todo', async () => {
    const load = loadOf(activityPage([auditEvent()]), activityPage([]), activityPage([OLDER]));
    await renderView(load);

    await userEvent.click(screen.getByRole('radio', { name: 'Personal de Nimbo' }));

    expect(load).toHaveBeenLastCalledWith({ origin: 'staff' });
    expect(
      screen.getByRole('heading', { name: 'No hay actividad con estos filtros' }),
    ).toBeTruthy();
    expect(screen.getByText('0 eventos')).toBeTruthy();
    const clear = screen.getAllByRole('button', { name: 'Limpiar filtros' });
    expect(clear).toHaveLength(1);
    await userEvent.click(clear[0] as HTMLElement);

    expect(load).toHaveBeenLastCalledWith({});
    expect(rowTitles()).toEqual(['Eliminaste definitivamente 2 elementos']);
  });

  it('CA-10: un rango inválido avisa, no consulta y conserva la lista', async () => {
    const load = loadOf(activityPage([auditEvent()]), activityPage([auditEvent()]));
    await renderView(load);

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-05' } });
    await act(async () => undefined);
    const calls = load.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    await act(async () => undefined);

    expect(screen.getByRole('alert').textContent).toContain('igual o posterior a la inicial');
    expect(load).toHaveBeenCalledTimes(calls);
    expect(rowTitles()).toEqual(['Subiste 1 archivo']);
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(1);
  });

  it('CA-15: si la carga falla muestra el código de soporte y «Reintentar» vuelve a pedir', async () => {
    const failure = new ApiClientError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'x',
      correlationId: 'corr-7f3a',
    });
    const load = loadOf(failure, activityPage([auditEvent()]));
    await renderView(load);

    const error = within(screen.getByRole('main')).getByRole('alert');
    expect(error.textContent).toContain('No pudimos cargar tu actividad');
    expect(error.textContent).toContain('corr-7f3a');
    await userEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));

    expect(load).toHaveBeenCalledTimes(2);
    expect(rowTitles()).toEqual(['Subiste 1 archivo']);
  });

  it('CA-15: sin violaciones de axe a 360 y 1440 px', async () => {
    const container = await renderView(
      loadOf(activityPage([SUPPORT_RESTORE, auditEvent()], 'c-2')),
    );

    for (const width of [360, 1440]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.dispatchEvent(new Event('resize'));
      const results = await act(async () => axe(container));
      expect({ width, violations: results.violations }).toEqual({ width, violations: [] });
    }
  });
});
