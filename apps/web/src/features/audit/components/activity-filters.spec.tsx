/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NO_ACTIVITY_FILTERS, type ActivityFilters as Filters } from '../hooks/use-activity';

import { ActivityFilters, type ActivityFiltersProps } from './activity-filters';

const INVALID_RANGE_MESSAGE =
  'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para ver tu actividad.';

function renderFilters(overrides: Partial<ActivityFiltersProps> = {}): ActivityFiltersProps {
  const props: ActivityFiltersProps = {
    filters: NO_ACTIVITY_FILTERS,
    invalidRange: false,
    clearable: false,
    resultText: 'Mostrando 2 eventos, del más reciente al más antiguo',
    onChange: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  };
  render(<ActivityFilters {...props} />);
  return props;
}

function origin(): HTMLElement {
  return screen.getByRole('group', { name: 'Origen' });
}

describe('ActivityFilters', () => {
  it('CA-10: el origen es «Todo · Yo · Personal de Nimbo», sin subfiltro de roles', () => {
    renderFilters();

    expect(within(origin()).getAllByRole('radio')).toHaveLength(3);
    expect(within(origin()).getByRole('radio', { name: 'Todo' })).toHaveProperty('checked', true);
    expect(within(origin()).getByRole('radio', { name: 'Yo' })).toHaveProperty('checked', false);
    expect(within(origin()).getByRole('radio', { name: 'Personal de Nimbo' })).toBeTruthy();
  });

  it('CA-10: elegir un origen avisa el cambio', async () => {
    const props = renderFilters();

    await userEvent.click(within(origin()).getByRole('radio', { name: 'Personal de Nimbo' }));

    expect(props.onChange).toHaveBeenCalledWith({ origin: 'staff' });
  });

  it('CA-10: «Desde» y «Hasta» son fechas nativas y avisan el día elegido', () => {
    const props = renderFilters({ filters: { ...NO_ACTIVITY_FILTERS, fromDay: '2026-10-01' } });

    const from = screen.getByLabelText('Desde');
    expect(from.getAttribute('type')).toBe('date');
    expect(from).toHaveProperty('value', '2026-10-01');
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-05' } });

    expect(props.onChange).toHaveBeenCalledWith({ toDay: '2026-10-05' });
  });

  it('CA-10: un rango inválido se anuncia como alerta ligada a los dos campos', () => {
    const filters: Filters = { origin: 'all', fromDay: '2026-10-05', toDay: '2026-09-01' };
    renderFilters({ filters, invalidRange: true, clearable: true });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(INVALID_RANGE_MESSAGE);
    for (const label of ['Desde', 'Hasta']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    }
  });

  it('CA-15: el contador anuncia el resultado y «Limpiar filtros» limpia', async () => {
    const props = renderFilters({ clearable: true });

    expect(screen.getByRole('status').textContent).toBe(
      'Mostrando 2 eventos, del más reciente al más antiguo',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('CA-13: no hay ningún control para ocultar las acciones internas', () => {
    renderFilters({ clearable: false });

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});
