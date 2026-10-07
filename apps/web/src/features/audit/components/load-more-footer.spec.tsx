/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LoadMoreFooter, type LoadMoreFooterProps } from './load-more-footer';

const END_NOTE = 'Llegaste al final: no hay actividad más antigua.';

function renderFooter(overrides: Partial<LoadMoreFooterProps> = {}): jest.Mock {
  const onLoadMore = jest.fn();
  render(<LoadMoreFooter status="idle" hasMore onLoadMore={onLoadMore} {...overrides} />);
  return onLoadMore;
}

describe('LoadMoreFooter', () => {
  it('CA-9: con más páginas, «Cargar más» pide la siguiente', async () => {
    const onLoadMore = renderFooter();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(END_NOTE)).toBeNull();
  });

  it('CA-15: mientras carga queda deshabilitado, lo anuncia y no vuelve a pedir', async () => {
    const onLoadMore = renderFooter({ status: 'loading' });

    const button = screen.getByRole('button', { name: 'Cargando más…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Cargando más actividad…');
  });

  it('CA-15: si falla, una alerta ofrece «Reintentar» en lugar del botón', async () => {
    const onLoadMore = renderFooter({ status: 'error' });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar más actividad.');
    expect(alert.textContent).toContain('lo que ya ves no cambió');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('CA-9: sin más páginas avisa el fin de la lista, sin botón', () => {
    renderFooter({ hasMore: false });

    expect(screen.getByRole('status').textContent).toBe(END_NOTE);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
