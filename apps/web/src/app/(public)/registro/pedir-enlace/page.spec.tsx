/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PedirEnlacePage from './page';

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('página pedir enlace', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test/api/v1';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/registro/pedir-enlace?email=otro@ejemplo.com');
  });

  it('pide el enlace a API_PUBLIC_URL y no toma el correo de la URL', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(<PedirEnlacePage />);

    expect(screen.getByRole('heading', { name: 'Pedir un enlace nuevo' })).toBeTruthy();
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('');

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost/api/v1/auth/resend-verification');
  });
});
