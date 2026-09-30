import { renderToStaticMarkup } from 'react-dom/server';

import { SessionProvider } from '../../../features/identity/session/session-provider';

import ClienteLayout from './layout';

describe('layout del grupo (cliente)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000/api/v1';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-21: envuelve las páginas del cliente con el proveedor de cargas, sin panel mientras no hay cargas', () => {
    const markup = renderToStaticMarkup(
      <SessionProvider apiPublicUrl="http://localhost/api/v1">
        <ClienteLayout>
          <p>Mis archivos</p>
        </ClienteLayout>
      </SessionProvider>,
    );

    expect(markup).toContain('Mis archivos');
    expect(markup).not.toContain('panel de cargas');
  });
});
