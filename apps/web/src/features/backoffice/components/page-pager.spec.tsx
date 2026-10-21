/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatCount } from '../../../lib/format-plan';

import { PagePager, type PagePagerProps } from './page-pager';

const LABEL = 'Paginación de los archivos de Laura Barrios';

function renderPager(overrides: Partial<PagePagerProps> = {}): jest.Mock {
  const onPageChange = jest.fn();
  render(
    <PagePager
      label={LABEL}
      noun="archivos"
      page={1}
      pageSize={10}
      total={214}
      onPageChange={onPageChange}
      {...overrides}
    />,
  );
  return onPageChange;
}

function pager(): HTMLElement {
  return screen.getByRole('navigation', { name: LABEL });
}

describe('PagePager (011 DF-66)', () => {
  it('CA-13: dice qué se muestra, de cuántos y la página de cuántas', () => {
    renderPager();

    expect(within(pager()).getByText('Mostrando 1–10 de 214 archivos')).toBeTruthy();
    expect(within(pager()).getByText('Página 1 de 22')).toBeTruthy();
  });

  it('CA-13: en la primera página «Anterior» no se puede usar y «Siguiente» pide la 2', async () => {
    const onPageChange = renderPager();

    expect(screen.getByRole('button', { name: 'Anterior' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('CA-13: en la última página muestra el resto y «Anterior» pide la previa', async () => {
    const onPageChange = renderPager({ page: 2, total: 11 });

    expect(within(pager()).getByText('Mostrando 11–11 de 11 archivos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Siguiente' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('CA-13: el rango y el total usan el mismo formato de cifras', () => {
    renderPager({ page: 1001, total: 12140 });

    const range = within(pager()).getByText(/^Mostrando/);

    expect(range.textContent).toBe(
      `Mostrando ${formatCount(10001)}–${formatCount(10010)} de ${formatCount(12140)} archivos`,
    );
  });

  it('CA-17: los botones miden 44 px en móvil', () => {
    renderPager();

    expect(screen.getByRole('button', { name: 'Siguiente' }).className).toContain('h-11');
  });
});
