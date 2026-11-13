/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Select } from './select';

describe('Select', () => {
  it('sigue siendo un combobox nativo con nombre accesible y notifica el cambio', async () => {
    const onChange = jest.fn();
    render(
      <Select aria-label="Orden" defaultValue="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Orden' }), 'B');

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marca el error y respeta disabled', () => {
    render(
      <Select aria-label="Orden" error disabled>
        <option>A</option>
      </Select>,
    );

    const select = screen.getByRole('combobox', { name: 'Orden' });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect((select as HTMLSelectElement).disabled).toBe(true);
  });

  it('aplica className al contenedor, no al select', () => {
    const { container } = render(
      <Select aria-label="Orden" className="sm:w-60">
        <option>A</option>
      </Select>,
    );

    expect(container.firstElementChild?.classList.contains('sm:w-60')).toBe(true);
  });
});
