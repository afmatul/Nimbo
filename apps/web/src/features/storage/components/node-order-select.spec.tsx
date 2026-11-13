/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NodeOrderSelect } from './node-order-select';

describe('NodeOrderSelect', () => {
  it('muestra el orden vigente y pide el que se elige', async () => {
    const onChange = jest.fn();
    render(
      <NodeOrderSelect order={{ sort: 'created', dir: 'desc' }} busy={false} onChange={onChange} />,
    );
    const select = screen.getByRole('combobox', { name: 'Ordenar' });
    expect(select.textContent).toBe('Fecha de creación, más recientes primero');
    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: 'Nombre, A–Z' }));
    expect(onChange).toHaveBeenCalledWith({ sort: 'name', dir: 'asc' });
  });

  it('se deshabilita mientras llega el nuevo orden', () => {
    render(<NodeOrderSelect order={{ sort: 'name', dir: 'asc' }} busy onChange={jest.fn()} />);
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
  });
});
