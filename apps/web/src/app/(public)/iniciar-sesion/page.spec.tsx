/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import IniciarSesionPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

async function renderPage(query: Record<string, string> = {}): Promise<HTMLElement> {
  const page = await IniciarSesionPage({ searchParams: Promise.resolve(query) });
  return render(page).container;
}

describe('página de inicio de sesión', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-27: reemplaza el marcador de 001 con el formulario y el panel del mockup', async () => {
    await renderPage();

    expect(screen.queryByText('Inicio de sesión disponible pronto')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeTruthy();
    expect(screen.getByText('Agente Nimbo incluido en todos los planes')).toBeTruthy();
    expect(screen.getByText(/Tu archivo, ordenado y buscable desde el primer día/)).toBeTruthy();
  });

  it('CA-1: enlaza a crear cuenta y a recuperar la contraseña', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: 'Crear cuenta' }).getAttribute('href')).toBe(
      '/registro',
    );
    expect(
      screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).getAttribute('href'),
    ).toBe('/recuperar-contrasena');
  });

  it('CA-8: con ?sesion=terminada muestra el aviso', async () => {
    await renderPage({ sesion: 'terminada' });

    expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeTruthy();
  });

  it('sin el parámetro no muestra el aviso', async () => {
    await renderPage({ sesion: 'otra-cosa' });

    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeNull();
  });

  it('CA-27: axe sin violaciones serias ni críticas', async () => {
    const container = await renderPage({ sesion: 'terminada' });

    const results = await axe(container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
