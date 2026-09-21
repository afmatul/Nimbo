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
});
