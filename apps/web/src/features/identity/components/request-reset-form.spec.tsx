/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';

import { RequestResetForm } from './request-reset-form';

const API = 'http://localhost/api/v1';

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

describe('RequestResetForm', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  async function submit(email: string): Promise<void> {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Correo'), email);
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
  }

  it('default: tarjeta sin pasos del registro, con el correo y la vuelta a iniciar sesión', () => {
    render(<RequestResetForm apiPublicUrl={API} />);

    expect(
      screen.getByRole('heading', { name: 'Restablecer contraseña' }).closest('.shadow-card'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Pasos del registro' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
      '/iniciar-sesion',
    );
  });

  it('valida el correo con el esquema de contracts y no llama a la API', async () => {
    render(<RequestResetForm apiPublicUrl={API} />);

    await submit('ana');

    expect(
      await screen.findByText('Escribe un correo válido, por ejemplo nombre@dominio.com.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Correo').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enviando: el botón queda deshabilitado y con texto de carga', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    render(<RequestResetForm apiPublicUrl={API} />);

    await submit('ana@ejemplo.com');

    const button = await screen.findByRole('button', { name: 'Enviando enlace' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['ana@ejemplo.com', 'nadie@nimbo.me'])(
    'CA-18: el éxito muestra la misma pantalla neutra para %s',
    async (email) => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
      render(<RequestResetForm apiPublicUrl={API} />);

      await submit(email);

      expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe(
        `Si hay una cuenta con ${email}, te enviamos un enlace para restablecer tu contraseña. Vence en 1 hora.`,
      );
      expect(screen.queryByRole('button', { name: 'Cambiar correo' })).toBeNull();
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${API}/auth/forgot-password`);
    },
  );

  it('CA-18: el límite muestra el texto de recuperación con los minutos de Retry-After', async () => {
    fetchMock.mockResolvedValue(
      errorResponse('IDENTITY_TOO_MANY_REQUESTS', 429, { 'retry-after': '120' }),
    );
    render(<RequestResetForm apiPublicUrl={API} />);

    await submit('ana@ejemplo.com');

    const limit = await screen.findByText(/Ya te enviamos un enlace hace poco/);
    expect(limit.textContent).toContain('2 minutos');
    expect(document.querySelector('[data-state="limite"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeTruthy();
  });

  it('error: un fallo del servidor muestra la alerta con el código para soporte', async () => {
    fetchMock.mockResolvedValue(errorResponse('INTERNAL_ERROR', 500));
    render(<RequestResetForm apiPublicUrl={API} />);

    await submit('ana@ejemplo.com');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No pudimos enviar el enlace.');
    expect(alert.textContent).toContain('corr-prueba');
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeTruthy();
  });

  it('no tiene violaciones graves de accesibilidad (default, error y revisa-tu-correo)', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'accepted' }, 202));
    const view = render(<RequestResetForm apiPublicUrl={API} />);
    expect(seriousViolations(await axe(view.container))).toEqual([]);

    await submit('ana@ejemplo.com');
    await screen.findByRole('alert');
    expect(seriousViolations(await axe(view.container))).toEqual([]);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar enlace' }));
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
    expect(seriousViolations(await axe(view.container))).toEqual([]);
  });
});
