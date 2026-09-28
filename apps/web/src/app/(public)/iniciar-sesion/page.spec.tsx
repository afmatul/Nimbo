import { renderToStaticMarkup } from 'react-dom/server';

import IniciarSesionPage from './page';

describe('página de inicio de sesión', () => {
  it('anuncia que el inicio de sesión todavía no está disponible', () => {
    const markup = renderToStaticMarkup(<IniciarSesionPage />);
    expect(markup).toContain('Inicio de sesión disponible pronto');
  });
});
