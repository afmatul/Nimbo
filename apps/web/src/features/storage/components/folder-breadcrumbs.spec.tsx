/**
 * @jest-environment jsdom
 */
import type { FolderRef } from '@nimbo/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { FolderBackLink, FolderBreadcrumbs } from './folder-breadcrumbs';

function folder(index: number): FolderRef {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Nivel ${index}`,
  };
}

const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };

function crumbTexts(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Ruta' });
  return within(nav)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('FolderBreadcrumbs (CA-5)', () => {
  it('en la raíz solo muestra «Mis archivos» como página actual', () => {
    render(<FolderBreadcrumbs breadcrumbs={[]} />);

    expect(crumbTexts()).toEqual(['Mis archivos']);
    expect(screen.getByText('Mis archivos').getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('enlaza la raíz y cada carpeta madre; la carpeta abierta no es enlace', () => {
    render(<FolderBreadcrumbs breadcrumbs={[ALPHA, FASE3]} />);

    expect(crumbTexts()).toEqual(['Mis archivos', 'Proyecto Alpha', 'Fase 3 · RAG']);
    expect(screen.getByRole('link', { name: 'Mis archivos' }).getAttribute('href')).toBe(
      '/archivos',
    );
    expect(screen.getByRole('link', { name: 'Proyecto Alpha' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${ALPHA.id}`,
    );
    expect(screen.getByText('Fase 3 · RAG').getAttribute('aria-current')).toBe('page');
  });

  it('con 4 niveles (raíz incluida) no colapsa nada', () => {
    render(<FolderBreadcrumbs breadcrumbs={[folder(1), folder(2), folder(3)]} />);

    expect(crumbTexts()).toEqual(['Mis archivos', 'Nivel 1', 'Nivel 2', 'Nivel 3']);
  });

  it('con más de 4 niveles colapsa los intermedios en «…» y los muestra en un menú', async () => {
    const path = Array.from({ length: 10 }, (_, index) => folder(index + 1));
    render(<FolderBreadcrumbs breadcrumbs={path} />);

    expect(crumbTexts()).toEqual(['Mis archivos', '…', 'Nivel 9', 'Nivel 10']);
    const more = screen.getByRole('button', { name: 'Mostrar 8 carpetas intermedias' });

    more.focus();
    await act(async () => {
      fireEvent.keyDown(more, { key: 'Enter' });
    });

    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(path.slice(0, 8).map((ref) => ref.name));
    expect(items[0]?.getAttribute('href')).toBe(`/archivos/carpeta/${path[0]?.id ?? ''}`);
  });
});

describe('FolderBackLink (CA-5, móvil)', () => {
  it('en el primer nivel vuelve a «Mis archivos»', () => {
    render(<FolderBackLink breadcrumbs={[ALPHA]} />);

    const link = screen.getByRole('link', { name: 'Volver a Mis archivos' });
    expect(link.getAttribute('href')).toBe('/archivos');
    expect(link.textContent).toBe('Mis archivos');
  });

  it('más abajo vuelve a la carpeta anterior por su nombre, nunca «carpeta madre»', () => {
    render(<FolderBackLink breadcrumbs={[ALPHA, FASE3]} />);

    const link = screen.getByRole('link', { name: 'Volver a Proyecto Alpha' });
    expect(link.getAttribute('href')).toBe(`/archivos/carpeta/${ALPHA.id}`);
    expect(document.body.textContent).not.toMatch(/carpeta madre/i);
  });

  it('solo se ve en pantallas angostas (las migas están en la barra superior)', () => {
    render(<FolderBackLink breadcrumbs={[ALPHA]} />);

    expect(screen.getByRole('link').classList.contains('md:hidden')).toBe(true);
  });
});
