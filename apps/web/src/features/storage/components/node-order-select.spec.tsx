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
    expect((select as HTMLSelectElement).selectedOptions[0]?.textContent).toBe(
      'Fecha de creación, más recientes primero',
    );
    await userEvent.selectOptions(select, 'Nombre, A–Z');
    expect(onChange).toHaveBeenCalledWith({ sort: 'name', dir: 'asc' });
  });

  it('se deshabilita mientras llega el nuevo orden', () => {
    render(<NodeOrderSelect order={{ sort: 'name', dir: 'asc' }} busy onChange={jest.fn()} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  });
});
