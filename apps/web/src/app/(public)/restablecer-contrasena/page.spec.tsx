/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { jsonResponse } from '../../../lib/test-http';

import RestablecerContrasenaPage from './page';

describe('página restablecer contraseña', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    window.history.replaceState(null, '', '/restablecer-contrasena#token=tok');
  });

  it('CA-20: comprueba el enlace contra API_PUBLIC_URL y muestra el formulario', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'valid' }));
    render(<RestablecerContrasenaPage />);

    expect(await screen.findByRole('heading', { name: 'Elige una contraseña nueva' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost/api/v1/auth/reset-password/check',
    );
  });
});
