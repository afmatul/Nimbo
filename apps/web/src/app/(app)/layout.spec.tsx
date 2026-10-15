import { renderToStaticMarkup } from 'react-dom/server';

import AppGroupLayout from './layout';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

describe('layout del grupo (app)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-28: en el servidor no muestra el contenido privado, solo la carga de la sesión', () => {
    const markup = renderToStaticMarkup(
      <AppGroupLayout>
        <p>Contenido privado</p>
      </AppGroupLayout>,
    );

    expect(markup).toContain('Cargando tu sesión');
    expect(markup).not.toContain('Contenido privado');
  });
});
