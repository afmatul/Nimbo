/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider } from '../../identity/session/session-provider';
import { GB, spaceSummaryWith, TEST_PLAN_NAME } from '../test-space-summary';

import type { SpaceSummaryState } from './space-provider';
import { SpaceSummaryView } from './space-summary-view';

function renderView(state: SpaceSummaryState, onRetry: () => void = jest.fn()): void {
  render(
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <SpaceSummaryView state={state} onRetry={onRetry} />
    </SessionProvider>,
  );
}

function ready(usedBytes: number, trashBytes = 0): SpaceSummaryState {
  return { status: 'ready', summary: spaceSummaryWith(usedBytes, { trashBytes }) };
}

function usageCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Espacio usado' });
}

describe('SpaceSummaryView', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  });

  it('CA-1: muestra usado, disponible, cuota y porcentaje, sin ofertas de ampliación', () => {
    renderView(ready(4.8 * GB));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Espacio de almacenamiento' }),
    ).toBeTruthy();
    expect(screen.getByText('Cuánto usas de tu plan y en qué se va.')).toBeTruthy();
    const card = usageCard();
    expect(within(card).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('32');
    expect(card.querySelector('[data-usage-figure]')?.textContent).toBe('4,8 GB de 15 GB');
    expect(card.textContent).toContain('32 %');
    expect(card.textContent).toContain('Usado4,8 GB');
    expect(card.textContent).toContain('Disponible10,2 GB');
    expect(card.textContent).toContain('Cuota del plan15 GB');
    expect(card.textContent).toContain('Tienes espacio de sobra.');
    expect(screen.queryByText(/Ampliar|Ver planes|Mejora/u)).toBeNull();
    expect(screen.queryByRole('status', { name: /cuota/u })).toBeNull();
  });

  it('CA-1, CA-6, D-20: «Tu plan» muestra nombre, cuota, máximo por archivo y días de papelera de la API', () => {
    renderView(ready(4.8 * GB));

    const plan = screen.getByRole('region', { name: 'Tu plan' });
    expect(within(plan).getByText(TEST_PLAN_NAME)).toBeTruthy();
    expect(plan.textContent).toContain('15 GB de almacenamiento');
    expect(plan.textContent).toContain('Hasta 50 MB por archivo');
    expect(plan.textContent).toContain('La papelera guarda lo eliminado 7 días');
  });

  it('011b CA-5: con un extra vigente, la cuota total y la nota con los GB extra y su último día', () => {
    renderView({
      status: 'ready',
      summary: spaceSummaryWith(4.8 * GB, {
        extra: { bytes: 50 * GB, until: '2026-11-16T06:00:00.000Z' },
      }),
    });

    const card = usageCard();
    expect(card.querySelector('[data-usage-figure]')?.textContent).toBe('4,8 GB de 65 GB');
    expect(card.textContent).toContain(
      'Tu cuota incluye 50 GB extra hasta el 15 de noviembre de 2026.',
    );
    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('region', { name: 'Almacenamiento' }).textContent).toContain(
      'Tu cuota incluye 50 GB extra hasta el 15 nov 2026.',
    );
  });

  it('011b CA-5: con un extra vigente, la cuota se rotula «Cuota total» y «Tu plan» muestra la del plan', () => {
    renderView({
      status: 'ready',
      summary: spaceSummaryWith(4.8 * GB, {
        extra: { bytes: 50 * GB, until: '2026-11-16T06:00:00.000Z' },
      }),
    });

    const card = usageCard();
    expect(card.textContent).toContain('Cuota total65 GB');
    expect(card.textContent).not.toContain('Cuota del plan');
    const plan = screen.getByRole('region', { name: 'Tu plan' });
    expect(plan.textContent).toContain('15 GB de almacenamiento');
  });

  it('011b CA-5: sin extra, la cuota sigue rotulada «Cuota del plan» y «Tu plan» muestra la misma', () => {
    renderView(ready(4.8 * GB));

    expect(usageCard().textContent).toContain('Cuota del plan15 GB');
    expect(usageCard().textContent).not.toContain('Cuota total');
    const plan = screen.getByRole('region', { name: 'Tu plan' });
    expect(plan.textContent).toContain('15 GB de almacenamiento');
  });

  it('011b CA-5: sin extra (o ya vencido), no hay nota', () => {
    renderView(ready(4.8 * GB));

    expect(screen.queryByText(/GB extra/u)).toBeNull();
  });

  it('D-18: el ítem «Espacio» de la navegación lleva a /espacio', () => {
    renderView(ready(4.8 * GB));

    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('link', { name: 'Espacio' }).getAttribute('href')).toBe(
      '/espacio',
    );
  });

  it('CA-5: en 70–89 % avisa «Tu cuota está al X %.» con lo que queda y las acciones', () => {
    renderView(ready(12.3 * GB, 0.5 * GB));

    const notice = screen.getByRole('status', { name: 'Tu cuota está al 82 %.' });
    expect(notice.textContent).toContain(
      'Te quedan 2,7 GB. Elimina archivos que ya no necesites para seguir subiendo.',
    );
    expect(notice.textContent).toContain('Lo que está en la papelera sigue ocupando espacio');
    expect(within(notice).getByRole('link', { name: 'Liberar espacio' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(
      within(notice).getByRole('link', { name: 'Ver papelera (500 MB)' }).getAttribute('href'),
    ).toBe('/papelera');
    expect(within(usageCard()).queryByRole('link')).toBeNull();
  });

  it('CA-5: el texto del tramo aparece una sola vez en el contenido (el aviso), no también en el medidor', () => {
    renderView(ready(12.3 * GB));

    expect(within(screen.getByRole('main')).getAllByText('Tu cuota está al 82 %.')).toHaveLength(1);
    expect(usageCard().textContent).not.toContain('Tu cuota está al 82 %.');
    expect(usageCard().textContent).not.toContain('Tienes espacio de sobra.');
  });

  it('CA-5: la tarjeta de cuota de la barra lateral repite el tramo sin enlaces (ya estás en el resumen)', () => {
    renderView(ready(12.3 * GB));

    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    const quota = within(sidebar).getByRole('region', { name: 'Almacenamiento' });
    expect(quota.textContent).toContain('Tu cuota está al 82 %.');
    expect(within(quota).queryByRole('link')).toBeNull();
  });

  it('CA-8: si el resumen falla, la tarjeta lateral también lo dice y la navegación sigue', () => {
    renderView({ status: 'error' });

    const sidebar = screen.getByRole('complementary', { name: 'Barra lateral de escritorio' });
    expect(within(sidebar).getByRole('region', { name: 'Almacenamiento' }).textContent).toContain(
      'No pudimos calcular tu espacio.',
    );
    expect(within(sidebar).getByRole('link', { name: 'Mis Archivos' })).toBeTruthy();
  });

  it('CA-5: en 90–99 % el aviso es una alerta «Espacio casi agotado.»', () => {
    renderView(ready(14.1 * GB, 0.8 * GB));

    const notice = screen.getByRole('alert', { name: 'Espacio casi agotado.' });
    expect(notice.textContent).toContain('Te quedan 900 MB.');
    expect(notice.className).toContain('bg-destructive-soft/10');
  });

  it('CA-5: al 100 % dice «Espacio agotado.» y que no se puede subir; sin papelera no la ofrece', () => {
    renderView(ready(15 * GB));

    const notice = screen.getByRole('alert', { name: 'Espacio agotado.' });
    expect(notice.textContent).toContain(
      'Usas 15 GB de 15 GB. No podrás subir archivos hasta que liberes espacio.',
    );
    expect(within(notice).getByRole('link', { name: 'Liberar espacio' })).toBeTruthy();
    expect(within(notice).queryByRole('link', { name: /Ver papelera/u })).toBeNull();
  });

  it('CA-8: mientras carga muestra el esqueleto de las tarjetas, «Calculando tu espacio…» y la navegación sigue', () => {
    renderView({ status: 'loading' });

    const main = screen.getByRole('main');
    expect(within(main).getByRole('status').textContent).toBe('Calculando tu espacio…');
    const busy = main.querySelector('[aria-busy="true"]');
    const skeleton = busy?.querySelector('[data-space-skeleton]');
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton?.innerHTML).toContain('animate-pulse');
    expect(skeleton?.innerHTML).toContain('motion-reduce:animate-none');
    expect(screen.queryByRole('region', { name: 'Espacio usado' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Mis Archivos' }).length).toBeGreaterThan(0);
  });

  it('CA-8: si falla explica la causa y «Reintentar» vuelve a pedir el resumen', async () => {
    const onRetry = jest.fn();
    renderView({ status: 'error' }, onRetry);

    const error = within(screen.getByRole('main')).getByRole('alert');
    expect(error.textContent).toContain('No pudimos calcular tu espacio.');
    expect(error.textContent).toContain('Tus archivos siguen guardados.');
    await userEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
