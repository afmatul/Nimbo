/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Select } from './select';

const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C', disabled: true },
] as const;

function renderSelect(onValueChange = jest.fn()) {
  render(<Select aria-label="Orden" value="a" options={OPTIONS} onValueChange={onValueChange} />);
  return screen.getByRole('combobox', { name: 'Orden' });
}

describe('Select', () => {
  it('es un combobox que abre un listbox, marca la opción elegida y notifica el cambio', async () => {
    const onValueChange = jest.fn();
    const trigger = renderSelect(onValueChange);
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.textContent).toBe('A');

    await userEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    await userEvent.click(screen.getByRole('option', { name: 'B' }));

    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('se maneja con teclado: flechas, Enter y Escape', async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    renderSelect(onValueChange).focus();

    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('respeta las opciones deshabilitadas', async () => {
    const onValueChange = jest.fn();
    await userEvent.click(renderSelect(onValueChange));
    await userEvent.click(screen.getByRole('option', { name: 'C' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('marca el error, respeta disabled y aplica className al disparador', () => {
    render(
      <Select
        aria-label="Orden"
        value="a"
        options={OPTIONS}
        onValueChange={jest.fn()}
        error
        disabled
        className="sm:w-60"
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Orden' }) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.disabled).toBe(true);
    expect(trigger.classList.contains('sm:w-60')).toBe(true);
  });
});
