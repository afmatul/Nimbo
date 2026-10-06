/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LoadMore, type LoadMoreProps } from './load-more';

function renderLoadMore(overrides: Partial<LoadMoreProps> = {}): LoadMoreProps {
  const props: LoadMoreProps = {
    status: 'idle',
    hasMore: true,
    added: 0,
    placeName: 'Mis archivos',
    onLoadMore: jest.fn(),
    onDismissError: jest.fn(),
    ...overrides,
  };
  render(<LoadMore {...props} />);
  return props;
}

describe('LoadMore (007 CA-9, CA-12)', () => {
  it('CA-9: «Cargar más» pide la página siguiente', async () => {
    const props = renderLoadMore();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('CA-9: sin más páginas no hay botón, pero anuncia lo que agregó la última', () => {
    renderLoadMore({ hasMore: false, added: 1 });

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Se cargó 1 elemento más.');
  });

  it('CA-12: mientras carga queda aria-disabled, no vuelve a pedir y lo anuncia', async () => {
    const props = renderLoadMore({ status: 'loading' });

    const button = screen.getByRole('button', { name: 'Cargando más…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);

    expect(props.onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Cargando más elementos de Mis archivos…');
  });

  it('CA-12: si falla muestra el aviso con «Reintentar» en lugar del botón', async () => {
    const props = renderLoadMore({ status: 'error' });

    expect(screen.getByRole('alert').textContent).toContain('No pudimos cargar más elementos.');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });
});
