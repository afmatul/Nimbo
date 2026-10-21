/**
 * @jest-environment jsdom
 */
import { SHARED_ERROR_CODES, type BackofficeMetricsResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatCount } from '../../../lib/format-plan';
import { apiError, callOf } from '../test-loads';
import { metricsResponse, WITH_INACTIVE_PLAN } from '../test-metrics';

import { BackofficeMetrics } from './backoffice-metrics';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const metricsOf = (...results: readonly (BackofficeMetricsResponse | Error)[]) =>
  callOf<BackofficeMetricsResponse>(...results);

async function renderMetrics(
  load: () => Promise<BackofficeMetricsResponse>,
  role: 'ADMIN' | 'OPERATOR' = 'ADMIN',
): Promise<void> {
  render(<BackofficeMetrics load={load} role={role} />);
  await act(async () => undefined);
}

function table(name: RegExp): HTMLElement {
  return screen.getByRole('table', { name });
}

/**
 * Las celdas con el texto tal como sale: el separador de miles del catálogo es un espacio inseparable (U+00A0) y
 * `formatCount` lo pone. En los `getByText` el espacio va normal, porque el DOM normaliza el inseparable.
 */
function rowsOf(name: RegExp): string[][] {
  return within(table(name))
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent ?? ''));
}

/** Los porcentajes de la tabla: un decimal y coma, como los bytes (PD-91). */
const percent = (value: number): string => `${value.toFixed(1).replace('.', ',')} %`;

describe('BackofficeMetrics: métricas agregadas (011 CA-12, CA-17)', () => {
  it('CA-12: default: título, aviso de privacidad y los dos totales', async () => {
    const load = metricsOf(metricsResponse());
    await renderMetrics(load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Métricas' })).toBeTruthy();
    expect(
      screen.getByText(
        'Son datos agregados: solo totales y conteos, sin información de ninguna cuenta ni de sus archivos.',
      ),
    ).toBeTruthy();
    const accounts = within(screen.getByText('Cuentas en total').parentElement as HTMLElement);
    expect(accounts.getByText('1 272 de clientes y 12 internas')).toBeTruthy();
    const space = within(screen.getByText('Espacio total usado').parentElement as HTMLElement);
    expect(space.getByText('39,4 TB')).toBeTruthy();
  });

  it('revisión I-1: los conteos usan el separador de miles del catálogo, no la coma', async () => {
    await renderMetrics(metricsOf(metricsResponse()));

    const value = within(
      screen.getByText('Cuentas en total').parentElement as HTMLElement,
    ).getByText(/^1.284$/);

    expect(value.textContent).toBe(formatCount(1284));
  });

  it('CA-12: cuentas por estado, con número y porcentaje del total en texto', async () => {
    await renderMetrics(metricsOf(metricsResponse()));

    expect(rowsOf(/Cuentas por estado/)).toEqual([
      ['Activas', formatCount(1275), percent(99.3)],
      ['Suspendidas', '9', percent(0.7)],
      ['Total', formatCount(1284), '100 %'],
    ]);
  });

  it('CA-12: cuentas por plan, solo de clientes, con el total de la tabla y la nota de las internas', async () => {
    await renderMetrics(metricsOf(metricsResponse()));

    expect(rowsOf(/Cuentas por plan/)).toEqual([
      ['Personal', formatCount(1012), percent(79.6)],
      ['Pro', '186', percent(14.6)],
      ['Equipo', '52', percent(4.1)],
      ['Institucional', '22', percent(1.7)],
      ['Total con plan', formatCount(1272), '100 %'],
    ]);
    expect(
      screen.getByText(
        'Las 12 cuentas internas no tienen plan; con ellas suman las 1 284 cuentas.',
      ),
    ).toBeTruthy();
  });

  it('CA-12: con-plan-inactivo: los activos en el orden del catálogo y, al final, el inactivo con su distintivo', async () => {
    await renderMetrics(metricsOf(WITH_INACTIVE_PLAN));

    expect(rowsOf(/Cuentas por plan/).map(([name]) => name)).toEqual([
      'Personal',
      'Pro',
      'Equipo 2027',
      'Institucional',
      'EquipoInactivo',
      'Total con plan',
    ]);
    expect(screen.getByText(/Incluye los planes inactivos que aún tienen cuentas\./)).toBeTruthy();
  });

  it('CA-12: un cliente sin suscripción no cuenta en ningún plan y la nota lo dice', async () => {
    const metrics = metricsResponse({
      byPlan: metricsResponse()
        .byPlan.slice(0, 1)
        .map((plan) => ({ ...plan, clientCount: 1270 })),
    });
    await renderMetrics(metricsOf(metrics));

    expect(rowsOf(/Cuentas por plan/).at(-1)).toEqual([
      'Total con plan',
      formatCount(1270),
      '100 %',
    ]);
    expect(
      screen.getByText(
        'Las 12 cuentas internas y 2 de clientes sin suscripción no tienen plan; con ellas suman las 1 284 cuentas.',
      ),
    ).toBeTruthy();
  });

  it('revisión I-2: con una sola cuenta interna el texto va en singular', async () => {
    const metrics = metricsResponse({
      accounts: {
        total: 2,
        clients: 1,
        internal: 1,
        byStatus: { active: 2, suspended: 0 },
      },
      byPlan: [
        {
          planId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          name: 'Personal',
          deactivatedAt: null,
          clientCount: 1,
        },
      ],
    });
    await renderMetrics(metricsOf(metrics));

    expect(
      screen.getByText('La 1 cuenta interna no tiene plan; con ella suman las 2 cuentas.'),
    ).toBeTruthy();
    expect(screen.getByText('La 1 cuenta de cliente con plan.')).toBeTruthy();
    expect(
      within(screen.getByText('Cuentas en total').parentElement as HTMLElement).getByText(
        '1 cliente y 1 interna',
      ),
    ).toBeTruthy();
  });

  it('revisión I-4: sin clientes con plan, el pie dice «0 %» y no «100 %»', async () => {
    const metrics = metricsResponse({ byPlan: [] });
    await renderMetrics(metricsOf(metrics));

    expect(rowsOf(/Cuentas por plan/).at(-1)).toEqual(['Total con plan', '0', '0 %']);
  });

  it('CA-12, RN-1: nunca hay enlaces ni filas de una cuenta', async () => {
    await renderMetrics(metricsOf(metricsResponse()));

    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('CA-17: cargando: esqueleto y «Cargando las métricas…»', async () => {
    await renderMetrics(metricsOf());

    expect(screen.getByRole('status').textContent).toContain('Cargando las métricas…');
  });

  it('CA-17: error con «Reintentar», que vuelve a pedirlas', async () => {
    const load = metricsOf(new TypeError('Failed to fetch'), metricsResponse());
    await renderMetrics(load);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar las métricas.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(2);
    expect(table(/Cuentas por estado/)).toBeTruthy();
  });

  it('CA-12, CA-17: operador: la misma pantalla y los mismos datos', async () => {
    await renderMetrics(metricsOf(metricsResponse()), 'OPERATOR');

    expect(screen.getByRole('heading', { level: 1, name: 'Métricas' })).toBeTruthy();
    expect(table(/Cuentas por plan/)).toBeTruthy();
  });

  it('CA-14: un 403 muestra «Sin permiso» y su botón lleva al inicio del rol', async () => {
    await renderMetrics(metricsOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN)), 'OPERATOR');

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ir a mi inicio' }));
    expect(push).toHaveBeenCalledWith('/interno');
  });
});
