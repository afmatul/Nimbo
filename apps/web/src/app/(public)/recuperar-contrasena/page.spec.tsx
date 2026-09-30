/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { jsonResponse } from '../../../lib/test-http';

import RecuperarContrasenaPage from './page';

describe('página recuperar contraseña', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test/api/v1';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-18: pide el enlace a API_PUBLIC_URL y muestra «Revisa tu correo»', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(<RecuperarContrasenaPage />);

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost/api/v1/auth/forgot-password',
    );
  });
});
