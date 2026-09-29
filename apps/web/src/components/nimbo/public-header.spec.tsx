import { renderToStaticMarkup } from 'react-dom/server';

import { expectNoA11yViolations } from '../test-a11y';

import { PublicHeader } from './public-header';

describe('PublicHeader', () => {
  it('muestra el logo y el enlace a iniciar sesión, sin datos de cuenta', () => {
    const markup = renderToStaticMarkup(<PublicHeader />);

    expect(markup).toContain('Nimbo');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/iniciar-sesion"');
    expect(markup).toContain('Iniciar sesión');
    expect(markup).not.toContain('@');
    expect(markup).toContain('min-h-11');
    expect(markup).toContain('bg-card');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    await expectNoA11yViolations(<PublicHeader />);
  });
});
