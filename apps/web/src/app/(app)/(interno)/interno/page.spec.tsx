import { renderToStaticMarkup } from 'react-dom/server';

import { SessionProvider } from '../../../../features/identity/session/session-provider';

import InternoPage from './page';

describe('marcador del área interna', () => {
  it('anuncia el área interna y ofrece cerrar sesión', () => {
    const markup = renderToStaticMarkup(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <InternoPage />
      </SessionProvider>,
    );

    expect(markup).toContain('Área interna');
    expect(markup).toContain('Cerrar sesión');
  });
});
