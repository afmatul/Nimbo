/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { jsonResponse } from '../../../lib/test-http';

import CrearContrasenaPage from './page';

describe('página crear tu contraseña', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    window.history.replaceState(null, '', '/crear-contrasena#token=tok');
  });

  it('CA-7: el enlace del alta abre la página, que comprueba el token contra API_PUBLIC_URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'valid' }));
    render(<CrearContrasenaPage />);

    expect(await screen.findByRole('heading', { name: 'Crea tu contraseña' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost/api/v1/auth/account-setup/check',
    );
  });
});
