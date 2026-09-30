/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { StrictMode } from 'react';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
import { recallSession, rememberSession } from '../session/session-memory';
import { sessionFixture } from '../session/test-session';

import { ResetPasswordView } from './reset-password-view';

const API = 'http://localhost/api/v1';
const STRONG_PASSWORD = 'Nimbo-Seguro-2026';

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

function openLink(fragment = '#token=tok-1'): void {
  window.history.replaceState(null, '', `/restablecer-contrasena${fragment}`);
}

describe('ResetPasswordView', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.history.replaceState(null, '', '/restablecer-contrasena');
  });

  function calledPaths(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]).replace(API, ''));
  }

  describe('lectura y comprobación del enlace (T-92)', () => {
    it('CA-20: borra el fragmento antes de comprobar el token una sola vez', async () => {
      const order: string[] = [];
      openLink('#token=abc');
      const tracked = jest.spyOn(window.history, 'replaceState');
      tracked.mockImplementation((state, title, url) => {
        order.push(`replace:${String(url)}`);
        tracked.mockRestore();
        window.history.replaceState(state, title, url);
      });
      fetchMock.mockImplementation((input) => {
        order.push(`fetch:${String(input)}`);
        return Promise.resolve(jsonResponse({ status: 'valid' }));
      });

      render(<ResetPasswordView apiPublicUrl={API} />);

      expect(
        await screen.findByRole('heading', { name: 'Elige una contraseña nueva' }),
      ).toBeTruthy();
      expect(order).toEqual([
        'replace:/restablecer-contrasena',
        `fetch:${API}/auth/reset-password/check`,
      ]);
      expect(window.location.hash).toBe('');
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ token: 'abc' });
    });

    it('comprueba una sola vez dentro de StrictMode', async () => {
      openLink();
      fetchMock.mockResolvedValue(jsonResponse({ status: 'valid' }));

      render(
        <StrictMode>
          <ResetPasswordView apiPublicUrl={API} />
        </StrictMode>,
      );

      await screen.findByRole('heading', { name: 'Elige una contraseña nueva' });
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    it('verificando: muestra el estado de carga mientras comprueba', () => {
      openLink();
      fetchMock.mockImplementation(() => new Promise(() => undefined));

      render(<ResetPasswordView apiPublicUrl={API} />);

      expect(screen.getByRole('heading', { name: 'Comprobando tu enlace' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe('Verificando…');
      expect(document.querySelector('[data-state="verificando"]')).toBeTruthy();
    });

    it.each([
      [
        'enlace-expirado',
        'IDENTITY_RESET_LINK_EXPIRED',
        'Enlace vencido',
        'Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.',
      ],
      [
        'enlace-invalido',
        'IDENTITY_RESET_LINK_INVALID',
        'Enlace no válido',
        'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
      ],
    ])('CA-20: %s ofrece pedir un enlace nuevo', async (state, code, title, message) => {
      openLink();
      fetchMock.mockResolvedValue(errorResponse(code, 422));

      render(<ResetPasswordView apiPublicUrl={API} />);

      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe(message);
      expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).getAttribute('href')).toBe(
        '/recuperar-contrasena',
      );
      expect(document.querySelector(`[data-state="${state}"]`)).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Pasos del registro' })).toBeNull();
    });

    it('sin token no llama a la API y queda en enlace-invalido', async () => {
      render(<ResetPasswordView apiPublicUrl={API} />);

      expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('formulario de contraseña nueva (T-93)', () => {
    async function openValidForm(): Promise<ReturnType<typeof userEvent.setup>> {
      openLink();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'valid' }));
      render(<ResetPasswordView apiPublicUrl={API} />);
      await screen.findByRole('heading', { name: 'Elige una contraseña nueva' });
      return userEvent.setup();
    }

    async function fill(
      user: ReturnType<typeof userEvent.setup>,
      password: string,
      confirmation = password,
    ): Promise<void> {
      await user.type(screen.getByLabelText('Contraseña nueva'), password);
      await user.type(screen.getByLabelText('Confirma la contraseña nueva'), confirmation);
      await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    }

    it('default: requisitos en vivo, confirmación y botón de envío', async () => {
      const user = await openValidForm();

      expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
      await user.type(screen.getByLabelText('Contraseña nueva'), STRONG_PASSWORD);
      expect(screen.queryAllByText('Falta')).toEqual([]);
      expect(screen.getByLabelText('Confirma la contraseña nueva')).toBeTruthy();
    });

    it('D-7: si la confirmación no coincide no envía', async () => {
      const user = await openValidForm();

      await fill(user, STRONG_PASSWORD, 'Nimbo-Seguro-2027');

      expect(
        await screen.findByText(
          'Las contraseñas no coinciden. Escribe la misma en los dos campos.',
        ),
      ).toBeTruthy();
      expect(calledPaths()).toEqual(['/auth/reset-password/check']);
    });

    it('CA-21: una contraseña que no cumple la política no se envía', async () => {
      const user = await openValidForm();

      await fill(user, 'corta');

      expect(await screen.findByText(/no cumple estos requisitos/)).toBeTruthy();
      expect(screen.getByLabelText('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
      expect(calledPaths()).toEqual(['/auth/reset-password/check']);
    });

    it('CA-21: error-campos con los requisitos que faltan según la API y el enlace sigue sirviendo', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            code: 'IDENTITY_WEAK_PASSWORD',
            message: 'No',
            correlationId: 'corr-w',
            fields: [{ field: 'password', reason: 'PASSWORD_EQUALS_EMAIL', message: 'Tu correo' }],
          },
          422,
        ),
      );

      await fill(user, STRONG_PASSWORD);

      expect(await screen.findByText('Tu contraseña no puede ser tu correo.')).toBeTruthy();
      expect(document.querySelector('[data-state="error-campos"]')).toBeTruthy();
      expect(screen.getByLabelText('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeTruthy();
    });

    it('enviando: el botón queda deshabilitado y con texto de carga', async () => {
      const user = await openValidForm();
      fetchMock.mockImplementationOnce(() => new Promise(() => undefined));

      await fill(user, STRONG_PASSWORD);

      const button = await screen.findByRole('button', { name: 'Cambiando contraseña' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    it('CA-19: éxito envía token y contraseña, olvida la sesión en memoria y ofrece iniciar sesión', async () => {
      rememberSession(sessionFixture());
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'password-reset' }));

      await fill(user, STRONG_PASSWORD);

      expect(await screen.findByRole('heading', { name: 'Contraseña restablecida' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe(
        'Listo. Cambiamos tu contraseña y cerramos todas tus sesiones. Inicia sesión con la nueva.',
      );
      expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
        '/iniciar-sesion',
      );
      expect(calledPaths()).toEqual(['/auth/reset-password/check', '/auth/reset-password']);
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
        token: 'tok-1',
        password: STRONG_PASSWORD,
      });
      expect(recallSession(Date.now())).toBeNull();
    });

    it('CA-20: si el enlace vence antes de enviar, muestra enlace-expirado', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(errorResponse('IDENTITY_RESET_LINK_EXPIRED', 422));

      await fill(user, STRONG_PASSWORD);

      expect(await screen.findByRole('heading', { name: 'Enlace vencido' })).toBeTruthy();
    });

    it('un fallo del servidor muestra la alerta y conserva el formulario', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 500));

      await fill(user, STRONG_PASSWORD);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('No pudimos cambiar tu contraseña.');
      expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeTruthy();
    });

    it('no tiene violaciones graves de accesibilidad (default, error-campos y éxito)', async () => {
      const user = await openValidForm();
      const container = document.body;
      expect(seriousViolations(await axe(container))).toEqual([]);

      await fill(user, 'corta');
      await screen.findByText(/no cumple estos requisitos/);
      expect(seriousViolations(await axe(container))).toEqual([]);

      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'password-reset' }));
      await user.clear(screen.getByLabelText('Contraseña nueva'));
      await user.clear(screen.getByLabelText('Confirma la contraseña nueva'));
      await fill(user, STRONG_PASSWORD);
      await screen.findByRole('heading', { name: 'Contraseña restablecida' });
      expect(seriousViolations(await axe(container))).toEqual([]);
    });
  });
});
