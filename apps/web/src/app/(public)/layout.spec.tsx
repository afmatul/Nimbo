import { renderToStaticMarkup } from 'react-dom/server';

import PublicLayout from './layout';

describe('layout público', () => {
  it('incluye la cabecera y el contenido', () => {
    const markup = renderToStaticMarkup(
      <PublicLayout>
        <p>Contenido público</p>
      </PublicLayout>,
    );

    expect(markup).toContain('Iniciar sesión');
    expect(markup).toContain('Contenido público');
  });
});
