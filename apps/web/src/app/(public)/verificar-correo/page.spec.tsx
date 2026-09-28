/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { resetVerifyEmailState } from '../../../features/identity/hooks/use-verify-email';
import VerificarCorreoPage from './page';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('página verificar correo', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    resetVerifyEmailState();
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test/api/v1';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    window.history.replaceState(null, '', '/verificar-correo#token=pagina');
  });

  it('verifica contra API_PUBLIC_URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    render(<VerificarCorreoPage />);

    expect(await screen.findByRole('heading', { name: '¡Listo! Tu correo está verificado.' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost/api/v1/auth/verify-email');
    expect(window.location.hash).toBe('');
  });
});
