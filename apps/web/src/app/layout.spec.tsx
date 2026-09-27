import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from './layout';

jest.mock('next/font/google', () => ({
  Inter: jest.fn(() => ({
    variable: '--font-inter',
  })),
}));

describe('RootLayout (CA-3)', () => {
  it('renderiza html con lang="es" y la variable de la fuente Inter como única familia', () => {
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
    expect(markup).toContain('--font-inter');
    expect(markup).not.toContain('--font-jetbrains-mono');
  });
});
