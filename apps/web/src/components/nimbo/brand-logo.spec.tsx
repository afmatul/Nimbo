/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { AppLayout } from './app-layout';
import { BrandLogo } from './brand-logo';
import { FocusedLayout } from './focused-layout';
import { HeaderAccountProvider } from './header-account';
import { PublicHeader } from './public-header';

describe('BrandLogo: el logo de Nimbo en todas las cabeceras', () => {
  it('enlaza al inicio público con el nombre visible', () => {
    render(<BrandLogo />);
    expect(screen.getByRole('link', { name: 'Nimbo' }).getAttribute('href')).toBe('/');
  });

  it('compacto: solo el isotipo, con nombre accesible propio', () => {
    render(<BrandLogo compact href="/archivos" label="Volver a Mis archivos" />);
    const link = screen.getByRole('link', { name: 'Volver a Mis archivos' });
    expect(link.getAttribute('href')).toBe('/archivos');
    expect(link.textContent).toBe('');
  });

  it('la cabecera pública lleva el logo', () => {
    render(<PublicHeader />);
    expect(screen.getByRole('link', { name: 'Nimbo' })).toBeTruthy();
  });

  it('con sesión, el logo del AppLayout lleva al inicio del rol y no a la raíz', () => {
    render(
      <HeaderAccountProvider account={null} homeHref="/archivos">
        <AppLayout>contenido</AppLayout>
      </HeaderAccountProvider>,
    );
    for (const link of screen.getAllByRole('link', { name: 'Nimbo' })) {
      expect(link.getAttribute('href')).toBe('/archivos');
    }
  });

  it('el marco enfocado (pago, 404) muestra el logo y la cuenta, sin barra lateral', () => {
    render(
      <HeaderAccountProvider account={<span>Menú de Ana</span>} homeHref="/archivos">
        <FocusedLayout>
          <p>Pago</p>
        </FocusedLayout>
      </HeaderAccountProvider>,
    );
    for (const link of screen.getAllByRole('link', { name: 'Nimbo' })) {
      expect(link.getAttribute('href')).toBe('/archivos');
    }
    expect(screen.getByText('Menú de Ana')).toBeTruthy();
    expect(screen.getByRole('main').textContent).toBe('Pago');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
