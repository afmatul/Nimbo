/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_NODE_ORDER, type NodeOrder } from '../node-order';

import { NodeSortMenu } from './node-sort-menu';

const BY_SIZE: NodeOrder = { sort: 'size', dir: 'desc' };

function trigger(): HTMLElement {
  return screen.getByRole('button', { expanded: false });
}

describe('NodeSortMenu (007 CA-10, CA-12)', () => {
  it('CA-10: dice el orden vigente y al elegir un campo conserva la dirección', async () => {
    const onChange = jest.fn();
    render(<NodeSortMenu order={DEFAULT_NODE_ORDER} sorting={false} onChange={onChange} />);
    expect(trigger().textContent).toBe('Ordenar: Fecha de creación, más recientes primero');

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Tamaño' }));

    expect(onChange).toHaveBeenCalledWith(BY_SIZE);
  });

  it('CA-12: mientras ordena dice «Ordenando…», lo anuncia y el menú no abre', async () => {
    const onChange = jest.fn();
    render(<NodeSortMenu order={BY_SIZE} sorting onChange={onChange} />);

    expect(trigger().textContent).toBe('Ordenando…');
    expect(trigger().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Ordenando por tamaño, mayor primero…');
    await userEvent.click(trigger());

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
