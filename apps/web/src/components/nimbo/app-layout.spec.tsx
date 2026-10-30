import { JSDOM } from 'jsdom';
import { Folder } from 'lucide-react';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgentEntryProvider } from './agent-entry';
import { AppLayout } from './app-layout';
import { HeaderAccountProvider } from './header-account';
import { useSidebarSlot } from './sidebar-slot';

/** Marca estática del layout como documento, para consultar su estructura (jsdom no mide layout). */
function parse(element: React.ReactElement): Document {
  return new JSDOM(`<!DOCTYPE html><body>${renderToStaticMarkup(element)}</body>`).window.document;
}

/** Monta en un jsdom propio, con los globales que React necesita para eventos y foco. */
function mountDom(): { dom: JSDOM; root: Root; container: HTMLElement } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost',
  });
  const g = global as unknown as Record<string, unknown>;
  for (const name of [
    'Node',
    'Element',
    'HTMLElement',
    'HTMLButtonElement',
    'HTMLAnchorElement',
    'KeyboardEvent',
  ]) {
    g[name] = dom.window[name as keyof typeof dom.window];
  }
  g['window'] = dom.window;
  g['document'] = dom.window.document;
  g['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = dom.window.document.getElementById('root') as HTMLElement;
  return { dom, root: createRoot(container), container };
}

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

    expect(markup).toContain('overflow-x-clip');
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
    const { dom, root } = mountDom();

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
    const { dom, root } = mountDom();

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

  it('005 CA-1: «Mis Archivos» enlaza a la página /archivos', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toMatch(/<a[^>]*href="\/archivos"[^>]*>(?:(?!<\/a>).)*Mis Archivos/);
  });

  it('018 CA-12: «Buscar» enlaza a /buscar justo después de «Mis Archivos», en la barra y en el menú móvil', () => {
    const doc = parse(
      <AppLayout initialMobileMenuOpen>
        <div>Contenido</div>
      </AppLayout>,
    );

    for (const name of ['Navegación principal', 'Navegación móvil']) {
      const links = [...doc.querySelectorAll(`nav[aria-label="${name}"] a`)];
      const labels = links.map((link) => link.textContent);
      expect(labels.slice(0, 2)).toEqual(['Mis Archivos', 'Buscar']);
      expect(links[1]?.getAttribute('href')).toBe('/buscar');
      expect(links[1]?.querySelector('svg')?.classList.contains('lucide-search')).toBe(true);
    }
  });

  it('permite personalizar los ítems de navegación mediante la prop navItems (S-1)', () => {
    const customItems = [
      { label: 'Archivos Propios', icon: Folder, href: '/custom-archivos', active: true },
    ];
    const markup = renderToStaticMarkup(
      <AppLayout navItems={customItems}>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toContain('Archivos Propios');
    expect(markup).toContain('/custom-archivos');
  });
  it('007 D-18: «Espacio» enlaza a /espacio y ya no hay «Planes y Cuota» (#planes)', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toMatch(/<a[^>]*href="\/espacio"[^>]*>(?:(?!<\/a>).)*Espacio/);
    expect(markup).not.toContain('#planes');
    expect(markup).not.toContain('Planes y Cuota');
  });

  it('006: la Papelera enlaza a /papelera', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toMatch(/<a[^>]*href="\/papelera"[^>]*>(?:(?!<\/a>).)*Papelera/);
  });

  it('006 CA-5: pinta la barra superior que recibe (migas) solo en escritorio', () => {
    const markup = renderToStaticMarkup(
      <AppLayout topBar={<nav aria-label="Ruta">Mis archivos</nav>}>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toMatch(
      /<header[^>]*>.*<div class="[^"]*hidden[^"]*md:flex[^"]*"><nav aria-label="Ruta">/,
    );
  });

  it('006 CA-27: la sección de la página va en la barra de escritorio y en el cajón móvil', () => {
    function WhereAmI(): React.JSX.Element {
      return <p>{useSidebarSlot().inDrawer ? 'En el cajón' : 'En la barra'}</p>;
    }
    const markup = renderToStaticMarkup(
      <AppLayout initialMobileMenuOpen sidebarSection={<WhereAmI />}>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toContain('>En la barra<');
    expect(markup).toContain('>En el cajón<');
  });

  it('CA-19: pinta la sección que recibe en la región desplazable, en escritorio y en el menú móvil', () => {
    const doc = parse(
      <AppLayout sidebarSection={<p>Sección propia</p>} initialMobileMenuOpen>
        <div>Contenido</div>
      </AppLayout>,
    );

    const regions = [...doc.querySelectorAll('[data-sidebar-section]')];
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.textContent).toBe('Sección propia');
      expect(region.classList.contains('min-h-0')).toBe(true);
      expect(region.classList.contains('flex-1')).toBe(true);
      expect(region.classList.contains('overflow-y-auto')).toBe(true);
    }
  });

  it('CA-19: la tarjeta de cuota queda al pie, fuera de la región que se desplaza', () => {
    const doc = parse(
      <AppLayout
        sidebarSection={<p>Sección propia</p>}
        quotaCard={<p>Tarjeta de cuota</p>}
        initialMobileMenuOpen
      >
        <div>Contenido</div>
      </AppLayout>,
    );

    const cards = [...doc.querySelectorAll('[data-quota-card]')];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.closest('[data-sidebar-section]')).toBeNull();
      expect(card.previousElementSibling?.hasAttribute('data-sidebar-section')).toBe(true);
      expect(card.classList.contains('shrink-0')).toBe(true);
    }
  });

  it('CA-19: la barra de escritorio queda fija bajo el encabezado y solo se desplaza el contenido', () => {
    const doc = parse(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    const root = doc.body.firstElementChild;
    const header = doc.querySelector('header');
    const sidebar = doc.querySelector('aside[aria-label="Barra lateral de escritorio"]');
    expect(root?.className).not.toMatch(/overflow-x-hidden/);
    expect(header?.classList.contains('h-header')).toBe(true);
    expect(sidebar?.classList.contains('md:sticky')).toBe(true);
    expect(sidebar?.classList.contains('md:top-header')).toBe(true);
    expect(sidebar?.classList.contains('md:h-below-header')).toBe(true);
    expect(sidebar?.classList.contains('md:self-start')).toBe(true);
    expect(doc.querySelector('main')?.className).not.toMatch(/overflow-y-auto/);
  });

  it('CA-19: sin sección no deja enlaces en la región ni el título «Carpetas»', () => {
    const doc = parse(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(doc.querySelector('[data-sidebar-section]')?.childElementCount).toBe(0);
    expect(doc.body.innerHTML).not.toContain('>Carpetas<');
  });

  it('CA-19: activar un enlace de la sección cierra el menú móvil y devuelve el foco al botón', async () => {
    const { dom, root, container } = mountDom();
    await act(async () => {
      root.render(
        <AppLayout sidebarSection={<a href="#seccion">Enlace de sección</a>}>
          <div>Contenido</div>
        </AppLayout>,
      );
    });
    const menuButton = container.querySelector(
      'button[aria-label="Abrir menú de navegación"]',
    ) as HTMLButtonElement;
    await act(async () => {
      menuButton.click();
    });

    const sectionLink = dom.window.document.querySelector(
      '[role="dialog"] [data-sidebar-section] a',
    ) as HTMLAnchorElement;
    await act(async () => {
      sectionLink.click();
    });

    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();
    expect(dom.window.document.activeElement).toBe(menuButton);
    await act(async () => {
      root.unmount();
    });
  });

  it('006 CA-12: la Papelera muestra su contador, en escritorio y en el menú móvil', () => {
    const markup = renderToStaticMarkup(
      <AppLayout trashCount={6} initialMobileMenuOpen>
        <div>Contenido</div>
      </AppLayout>,
    );

    const trashLinks = markup.match(/<a[^>]*href="\/papelera"[^>]*>(?:(?!<\/a>).)*<\/a>/g) ?? [];
    expect(trashLinks).toHaveLength(2);
    for (const link of trashLinks) {
      expect(link).toMatch(/tabular-nums[^"]*"><span aria-hidden="true">6</);
      expect(link).toContain('6 elementos');
    }
  });

  it('006 CA-12: con la papelera vacía o sin dato no muestra contador', () => {
    for (const trashCount of [0, undefined]) {
      const markup = renderToStaticMarkup(
        <AppLayout trashCount={trashCount}>
          <div>Contenido</div>
        </AppLayout>,
      );

      expect(markup).not.toContain('elementos</span>');
    }
  });

  it('007 CA-5: pinta la tarjeta de cuota que recibe bajo la navegación, en escritorio y en el menú móvil', () => {
    const markup = renderToStaticMarkup(
      <AppLayout quotaCard={<p>Tarjeta de cuota</p>} initialMobileMenuOpen>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup.match(/<p>Tarjeta de cuota<\/p>/g)).toHaveLength(2);
    expect(markup.indexOf('Tarjeta de cuota')).toBeGreaterThan(markup.indexOf('</nav>'));
  });

  it('007: sin tarjeta de cuota la barra lateral no deja hueco', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).not.toContain('data-quota-card');
  });

  it('006 CA-10: monta la región de avisos (sonner, ADR-0024)', () => {
    const markup = renderToStaticMarkup(
      <AppLayout>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).toMatch(/<section[^>]*aria-label="Avisos"[^>]*aria-live="polite"/);
  });

  it('CA-14: con sesión, la cabecera muestra el menú de la cuenta en lugar del correo', () => {
    const doc = parse(
      <HeaderAccountProvider account={<button type="button">Menú de la cuenta</button>}>
        <AppLayout userEmail="ana@ejemplo.com">
          <div>Contenido</div>
        </AppLayout>
      </HeaderAccountProvider>,
    );

    const header = doc.querySelector('header');
    expect(header?.textContent).toContain('Menú de la cuenta');
    expect(header?.textContent).not.toContain('ana@ejemplo.com');
  });
});

/** Entrada del agente como la llena el layout del Cliente: «Agente Nimbo» abre un panel de prueba. */
function AgentEntryHarness({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const entry = {
    open: () => setOpen(true),
    panel: open ? <aside aria-label="Panel de prueba">Panel del agente</aside> : null,
  };
  return <AgentEntryProvider entry={entry}>{children}</AgentEntryProvider>;
}

function agentButtonIn(scope: ParentNode): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === 'Agente Nimbo',
  );
  if (button === undefined) throw new Error('Sin botón «Agente Nimbo»');
  return button;
}

describe('AppLayout con la entrada del agente (020b)', () => {
  it('CA-1: «Agente Nimbo» abre el panel y main le reserva su ancho en escritorio', async () => {
    const { root, container } = mountDom();
    await act(async () => {
      root.render(
        <AgentEntryHarness>
          <AppLayout>
            <div>Contenido</div>
          </AppLayout>
        </AgentEntryHarness>,
      );
    });
    expect(container.querySelector('[aria-label="Panel de prueba"]')).toBeNull();

    const desktopNav = container.querySelector('[aria-label="Barra lateral de escritorio"]');
    await act(async () => {
      agentButtonIn(desktopNav as Element).click();
    });

    expect(container.querySelector('[aria-label="Panel de prueba"]')).not.toBeNull();
    expect(container.querySelector('main')?.className).toContain('mr-(--agent-panel-width)');
    await act(async () => {
      root.unmount();
    });
  });

  it('CA-1: en el menú móvil, «Agente Nimbo» cierra el cajón y abre el panel', async () => {
    const { dom, root, container } = mountDom();
    await act(async () => {
      root.render(
        <AgentEntryHarness>
          <AppLayout initialMobileMenuOpen>
            <div>Contenido</div>
          </AppLayout>
        </AgentEntryHarness>,
      );
    });
    const drawer = dom.window.document.querySelector('[role="dialog"]') as Element;

    await act(async () => {
      agentButtonIn(drawer).click();
    });

    expect(dom.window.document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[aria-label="Panel de prueba"]')).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('CA-18: sin la entrada del agente no hay «Agente Nimbo» ni panel', () => {
    const markup = renderToStaticMarkup(
      <AppLayout initialMobileMenuOpen>
        <div>Contenido</div>
      </AppLayout>,
    );

    expect(markup).not.toContain('Agente Nimbo');
    expect(markup).not.toContain('#agente');
    expect(markup).not.toContain('mr-(--agent-panel-width)');
  });
});
