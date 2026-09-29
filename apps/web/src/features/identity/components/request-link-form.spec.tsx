/**
 * @jest-environment jsdom
 */
import { EMAIL_REQUEST_COOLDOWN_SECONDS } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { REQUEST_LINK_EMAIL_KEY, saveRequestLinkEmail } from '../request-link-email-storage';

import { RequestLinkForm } from './request-link-form';

function jsonResponse(
  body: unknown,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

describe('RequestLinkForm', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/registro/pedir-enlace');
  });

  it('va en una tarjeta con el paso Verificación en curso y ofrece iniciar sesión', () => {
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    const steps = screen.getByRole('list', { name: 'Pasos del registro' });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain('Verificación');
    expect(
      screen.getByRole('heading', { name: 'Pedir un enlace nuevo' }).closest('.shadow-card'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
      '/iniciar-sesion',
    );
  });

  it('valida el correo con el esquema de reenvío y no llama a la API', async () => {
    const user = userEvent.setup();
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect(
      await screen.findByText('Escribe un correo válido, por ejemplo nombre@dominio.com.'),
    ).toBeTruthy();
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

  it('un 429 sin Retry-After usa la espera de EMAIL_REQUEST_COOLDOWN_SECONDS', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: 'IDENTITY_TOO_MANY_REQUESTS', message: 'Límite', correlationId: 'corr-429' },
        429,
      ),
    );
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect(
      await screen.findByText(
        `Podrás pedirlo de nuevo en ${String(EMAIL_REQUEST_COOLDOWN_SECONDS)} segundos.`,
      ),
    ).toBeTruthy();
  });

  it('un 500 muestra error-servidor con el mensaje genérico y el correlationId', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'Falla', correlationId: 'corr-500' }, 500),
    );
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Ocurrió un error inesperado');
    expect(alert.textContent).toContain('corr-500');
    expect(document.querySelector('[data-state="error-servidor"]')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Revisa tu correo' })).toBeNull();
  });

  it('con la red caída muestra error-servidor y permite reintentar', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202));
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'comparte este código con soporte',
    );

    await user.click(screen.getByRole('button', { name: 'Pedir enlace' }));
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
  });

  it('prellena el correo desde sessionStorage y no desde la URL', async () => {
    saveRequestLinkEmail(window.sessionStorage, 'ana@ejemplo.com', new Date());
    window.history.replaceState(null, '', '/registro/pedir-enlace?email=otro@ejemplo.com');

    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@ejemplo.com');
  });

  it('SEC-2: un correo guardado hace 24 h o más no se prellena y se borra', async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    saveRequestLinkEmail(window.sessionStorage, 'ana@ejemplo.com', dayAgo);

    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('');
    expect(window.sessionStorage.getItem(REQUEST_LINK_EMAIL_KEY)).toBeNull();
  });

  it('sin sessionStorage el correo queda vacío aunque la URL lo traiga', () => {
    window.history.replaceState(null, '', '/registro/pedir-enlace?email=otro@ejemplo.com');
    render(<RequestLinkForm apiPublicUrl="http://localhost/api/v1" />);

    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('');
  });
});
