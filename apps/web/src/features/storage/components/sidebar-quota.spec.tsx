/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';

import { GB, spaceSummaryWith } from '../test-space-summary';

import { SidebarQuota } from './sidebar-quota';
import type { SpaceSummaryState } from './space-provider';

function ready(usedBytes: number): SpaceSummaryState {
  return { status: 'ready', summary: spaceSummaryWith(usedBytes) };
}

function card(): HTMLElement {
  return screen.getByRole('region', { name: 'Almacenamiento' });
}

function linkHref(name: string): string | null {
  return within(card()).getByRole('link', { name }).getAttribute('href');
}

describe('SidebarQuota (CA-5, CA-8, D-19 d)', () => {
  it('CA-5: bajo el 70 % muestra porcentaje y GB en texto y «Ver detalle» hacia /espacio', () => {
    render(<SidebarQuota state={ready(4.8 * GB)} />);

    const bar = within(card()).getByRole('progressbar', { name: 'Almacenamiento' });
    expect(bar.getAttribute('aria-valuenow')).toBe('32');
    expect(card().textContent).toContain('32 %');
    expect(card().textContent).toContain('4,8 GB de 15 GB');
    expect(linkHref('Ver detalle')).toBe('/espacio');
    expect(within(card()).queryByRole('link', { name: 'Liberar espacio' })).toBeNull();
  });

  it('CA-5: en 70–89 % avisa «Tu cuota está al X %.» con «Liberar espacio» hacia /espacio', () => {
    render(<SidebarQuota state={ready(12.3 * GB)} />);

    expect(card().textContent).toContain('Tu cuota está al 82 %.');
    expect(linkHref('Liberar espacio')).toBe('/espacio');
    expect(within(card()).queryByRole('link', { name: 'Ver detalle' })).toBeNull();
  });

  it('CA-5: en 90–99 % dice «Espacio casi agotado.» y al 100 % «Espacio agotado.»', () => {
    const { rerender } = render(<SidebarQuota state={ready(14.1 * GB)} />);
    expect(card().textContent).toContain('Espacio casi agotado.');
    expect(linkHref('Liberar espacio')).toBe('/espacio');

    rerender(<SidebarQuota state={ready(15 * GB)} />);
    expect(card().textContent).toContain('Espacio agotado.');
  });

  it('011b CA-5: con un extra vigente lo nota con su último día; sin extra, no', () => {
    const withExtra = spaceSummaryWith(4.8 * GB, {
      extra: { bytes: 50 * GB, until: '2026-11-16T06:00:00.000Z' },
    });
    const { rerender } = render(<SidebarQuota state={{ status: 'ready', summary: withExtra }} />);
    expect(card().textContent).toContain('4,8 GB de 65 GB');
    expect(card().textContent).toContain('Tu cuota incluye 50 GB extra hasta el 15 nov 2026.');

    rerender(<SidebarQuota state={ready(4.8 * GB)} />);
    expect(card().textContent).not.toContain('extra');
  });

  it('en el propio resumen la tarjeta no lleva enlaces', () => {
    render(<SidebarQuota state={ready(12.3 * GB)} linked={false} />);

    expect(card().textContent).toContain('Tu cuota está al 82 %.');
    expect(within(card()).queryByRole('link')).toBeNull();
  });

  it('CA-8: mientras carga anuncia «Calculando tu espacio…» sin barra', () => {
    render(<SidebarQuota state={{ status: 'loading' }} />);

    expect(within(card()).getByRole('status').textContent).toBe('Calculando tu espacio…');
    expect(within(card()).queryByRole('progressbar')).toBeNull();
  });

  it('CA-8: si falla dice «No pudimos calcular tu espacio.» sin barra ni ofertas', () => {
    render(<SidebarQuota state={{ status: 'error' }} />);

    expect(card().textContent).toContain('No pudimos calcular tu espacio.');
    expect(within(card()).queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Ampliar|Ver planes|Mejora/u)).toBeNull();
  });
});
