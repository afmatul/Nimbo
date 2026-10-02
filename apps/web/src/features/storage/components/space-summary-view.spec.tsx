/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider } from '../../identity/session/session-provider';
import { GB, spaceSummaryWith } from '../test-space-summary';

import { SpaceSummaryView, type SpaceSummaryState } from './space-summary-view';

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
    expect(card.textContent).toContain('32 %');
    expect(card.textContent).toContain('Usado4,8 GB');
    expect(card.textContent).toContain('Disponible10,2 GB');
    expect(card.textContent).toContain('Cuota del plan15 GB');
    expect(card.textContent).toContain('Tienes espacio de sobra.');
    expect(screen.queryByText(/Ampliar|Ver planes|Mejora/u)).toBeNull();
    expect(screen.queryByRole('status', { name: /cuota/u })).toBeNull();
  });

  it('CA-1, CA-6: «Tu plan» muestra cuota, máximo por archivo y días de papelera de la API', () => {
    renderView(ready(4.8 * GB));

    const plan = screen.getByRole('region', { name: 'Tu plan' });
    expect(plan.textContent).toContain('15 GB de almacenamiento');
    expect(plan.textContent).toContain('Hasta 50 MB por archivo');
    expect(plan.textContent).toContain('La papelera guarda lo eliminado 7 días');
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
    expect(usageCard().textContent).toContain('Tu cuota está al 82 %.');
    expect(within(usageCard()).queryByRole('link')).toBeNull();
  });

  it('CA-5: en 90–99 % el aviso es una alerta «Espacio casi agotado.»', () => {
    renderView(ready(14.1 * GB, 0.8 * GB));

    const notice = screen.getByRole('alert', { name: 'Espacio casi agotado.' });
    expect(notice.textContent).toContain('Te quedan 900 MB.');
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

  it('CA-8: mientras carga muestra «Calculando tu espacio…» y la navegación sigue disponible', () => {
    renderView({ status: 'loading' });

    expect(
      screen
        .getByText('Calculando tu espacio…')
        .closest('[role="status"]')
        ?.getAttribute('aria-live'),
    ).toBe('polite');
    expect(screen.queryByRole('region', { name: 'Espacio usado' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Mis Archivos' }).length).toBeGreaterThan(0);
  });

  it('CA-8: si falla explica la causa y «Reintentar» vuelve a pedir el resumen', async () => {
    const onRetry = jest.fn();
    renderView({ status: 'error' }, onRetry);

    const error = screen.getByRole('alert');
    expect(error.textContent).toContain('No pudimos calcular tu espacio.');
    expect(error.textContent).toContain('Tus archivos siguen guardados.');
    await userEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
