import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppLayout } from './app-layout';

describe('AppLayout component (CA-5)', () => {
  it('renderiza encabezado, barra lateral de navegación y área de contenido principal', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div data-testid="pagina">Panel de control</div>
      </AppLayout>,
    );

    expect(markup).toContain('Nimbo');
    expect(markup).toContain('Panel de control');
    expect(markup).toContain('nav');
    expect(markup).toContain('header');
    expect(markup).toContain('main');
  });

  it('evita desbordamiento horizontal con clases responsivas y max-w seguro', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toContain('overflow-x-hidden');
    expect(markup).toContain('min-w-0');
  });

  it('incluye botón accesible de menú móvil con etiqueta aria', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toContain('aria-label="Abrir menú de navegación"');
  });

  it('renderiza el drawer móvil accesible con rol dialog, nombre aria e inert en fondo cuando está abierto', () => {
    const markup = renderToStaticMarkup(
      <AppLayout initialMobileMenuOpen={true}>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="mobile-menu-title"');
    expect(markup).toContain('id="mobile-menu-title"');
    expect(markup).toContain('Menú de navegación');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('inert');
  });

  // Test A (B-2a): Foco entra al primer enlace al abrir
  it('mueve automáticamente el foco al primer enlace dentro del drawer al abrir el menú', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });

    const g = global as unknown as Record<string, unknown>;
    g['window'] = dom.window;
    g['document'] = dom.window.document;
    g['Node'] = dom.window.Node;
    g['Element'] = dom.window.Element;
    g['HTMLElement'] = dom.window.HTMLElement;
    g['HTMLButtonElement'] = dom.window.HTMLButtonElement;
    g['HTMLAnchorElement'] = dom.window.HTMLAnchorElement;
    g['KeyboardEvent'] = dom.window.KeyboardEvent;
    g['IS_REACT_ACT_ENVIRONMENT'] = true;

    const container = dom.window.document.getElementById('root');
    if (!container) {
      throw new Error('Elemento root no encontrado');
    }
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppLayout>
          <div>Contenido</div>
        </AppLayout>,
      );
    });

    // 1. Inicialmente cerrado
    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();

    // 2. Simula clic en el botón de la hamburguesa
    const menuButton = dom.window.document.querySelector(
      'button[aria-label="Abrir menú de navegación"]',
    ) as HTMLButtonElement;
    await act(async () => {
      menuButton.click();
    });

    // 3. Menú abierto y foco en el primer enlace ("Mis Archivos")
    const dialog = dom.window.document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const firstLink = dialog?.querySelector('a') as HTMLAnchorElement;
    expect(dom.window.document.activeElement).toBe(firstLink);

    await act(async () => {
      root.unmount();
    });
  });

  // Test B (B-2a): Tecla Escape cierra el menú y devuelve el foco
  it('cierra el menú móvil y devuelve el foco al presionar la tecla Escape', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost',
    });

    const g = global as unknown as Record<string, unknown>;
    g['window'] = dom.window;
    g['document'] = dom.window.document;
    g['Node'] = dom.window.Node;
    g['Element'] = dom.window.Element;
    g['HTMLElement'] = dom.window.HTMLElement;
    g['HTMLButtonElement'] = dom.window.HTMLButtonElement;
    g['HTMLAnchorElement'] = dom.window.HTMLAnchorElement;
    g['KeyboardEvent'] = dom.window.KeyboardEvent;
    g['IS_REACT_ACT_ENVIRONMENT'] = true;

    const container = dom.window.document.getElementById('root');
    if (!container) {
      throw new Error('Elemento root no encontrado');
    }
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AppLayout>
          <div>Contenido</div>
        </AppLayout>,
      );
    });

    // 1. Abre el menú
    const menuButton = dom.window.document.querySelector(
      'button[aria-label="Abrir menú de navegación"]',
    ) as HTMLButtonElement;
    await act(async () => {
      menuButton.click();
    });
    expect(dom.window.document.querySelector('[role="dialog"]')).not.toBeNull();

    // 2. Dispara la tecla Escape
    await act(async () => {
      const escapeEvent = new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      dom.window.dispatchEvent(escapeEvent);
    });

    // 3. Comprueba que se cerró y el foco regresó al botón
    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();
    expect(dom.window.document.activeElement).toBe(menuButton);

    await act(async () => {
      root.unmount();
    });
  });
});
