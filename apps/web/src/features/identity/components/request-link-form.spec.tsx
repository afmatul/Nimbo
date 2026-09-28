/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { REQUEST_LINK_EMAIL_KEY, RequestLinkForm } from './request-link-form';

function jsonResponse(body: unknown, status: number, headers: Readonly<Record<string, string>> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe('RequestLinkForm', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/registro/pedir-enlace');
  });

  it('valida el correo con el esquema de reenvío y no llama a la API', async () => {
    const user = userEvent.setup();
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect(await screen.findByText('Escribe un correo válido, por ejemplo nombre@dominio.com.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['ana@ejemplo.com', 'nadie@nimbo.me'])(
    'el éxito muestra el mismo panel neutro para %s',
    async (email) => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
      render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

      await user.type(screen.getByLabelText('Correo'), email);
      await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

      expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
      expect(screen.getByText(/24 horas/)).toBeTruthy();
      expect(screen.getByText(new RegExp(email))).toBeTruthy();
      expect(screen.queryByText(/no existe|ya está verificado|no encontramos/i)).toBeNull();
    },
  );

  it('un 429 muestra limite-reenvio', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: 'IDENTITY_TOO_MANY_REQUESTS', message: 'Límite', correlationId: 'corr-429' },
        429,
        { 'retry-after': '120' },
      ),
    );
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect(await screen.findByText(/2 minutos/)).toBeTruthy();
    expect(document.querySelector('[data-state="limite-reenvio"]')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Revisa tu correo' })).toBeNull();
  });

  it('prellena el correo desde sessionStorage y no desde la URL', async () => {
    window.sessionStorage.setItem(REQUEST_LINK_EMAIL_KEY, 'ana@ejemplo.com');
    window.history.replaceState(null, '', '/registro/pedir-enlace?email=otro@ejemplo.com');

    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@ejemplo.com');
  });

  it('sin sessionStorage el correo queda vacío aunque la URL lo traiga', () => {
    window.history.replaceState(null, '', '/registro/pedir-enlace?email=otro@ejemplo.com');
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('');
  });
});
