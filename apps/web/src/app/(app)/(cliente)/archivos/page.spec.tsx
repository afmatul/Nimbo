import { renderToStaticMarkup } from 'react-dom/server';

import { SessionProvider } from '../../../../features/identity/session/session-provider';

import ArchivosPage from './page';

describe('marcador de Mis archivos (destino de CA-1)', () => {
  it('anuncia que los archivos aparecerán aquí y ofrece cerrar sesión', () => {
    const markup = renderToStaticMarkup(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <ArchivosPage />
      </SessionProvider>,
    );

    expect(markup).toContain('Mis archivos');
    expect(markup).toContain('Tus archivos aparecerán aquí');
    expect(markup).toContain('Cerrar sesión');
  });
});
