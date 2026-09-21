import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from './layout';

describe('RootLayout (CA-3)', () => {
  it('renderiza html con lang="es" y variables de fuentes Inter y JetBrains Mono', () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="child">Contenido de prueba</div>
      </RootLayout>,
    );

    expect(markup).toContain('lang="es"');
    expect(markup).toContain('Contenido de prueba');
    expect(markup).toContain('font-sans');
    expect(markup).toContain('bg-background');
    expect(markup).toContain('text-foreground');
  });
});
