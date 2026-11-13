/**
 * @jest-environment jsdom
 */
import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { StrictMode } from 'react';

import { messageForCode } from '../../../../lib/error-catalog';
import { errorResponse, jsonResponse } from '../../../../lib/test-http';

import { AccountSetupView } from './account-setup-view';

const API = 'http://localhost/api/v1';
const STRONG_PASSWORD = 'Nimbo-Seguro-2026';
const VIEWPORTS = [360, 1440] as const;
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const FORM_TITLE = 'Crea tu contraseña';
const SUBMIT = 'Crear contraseña';

type User = ReturnType<typeof userEvent.setup>;

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    const results = await axe(document.body);
    const violations = results.violations
      .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
      .map((violation) => violation.id);
    expect({ width, violations }).toEqual({ width, violations: [] });
  }
}

function openLink(fragment = '#token=tok-1'): void {
  window.history.replaceState(null, '', `/crear-contrasena${fragment}`);
}

describe('AccountSetupView', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.history.replaceState(null, '', '/crear-contrasena');
  });

  function calledPaths(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]).replace(API, ''));
  }

  describe('comprobación del enlace', () => {
    it('CA-5: borra el fragmento y comprueba el token una sola vez, también en StrictMode', async () => {
      openLink('#token=abc');
      fetchMock.mockResolvedValue(jsonResponse({ status: 'valid' }));

      render(
        <StrictMode>
          <AccountSetupView apiPublicUrl={API} />
        </StrictMode>,
      );

      expect(await screen.findByRole('heading', { name: FORM_TITLE })).toBeTruthy();
      expect(window.location.hash).toBe('');
      await waitFor(() => {
        expect(calledPaths()).toEqual(['/auth/account-setup/check']);
      });
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ token: 'abc' });
    });

    it('verificando: muestra el estado de carga mientras comprueba', () => {
      openLink();
      fetchMock.mockImplementation(() => new Promise(() => undefined));

      render(<AccountSetupView apiPublicUrl={API} />);

      expect(screen.getByRole('heading', { name: 'Comprobando tu enlace' })).toBeTruthy();
      expect(document.querySelector('[data-state="verificando"]')).toBeTruthy();
    });

    it('CA-5: enlace-vencido lleva a «¿Olvidaste tu contraseña?» y recibe el foco', async () => {
      openLink();
      fetchMock.mockResolvedValue(errorResponse(IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED, 422));

      render(<AccountSetupView apiPublicUrl={API} />);

      expect(await screen.findByRole('heading', { name: 'Enlace vencido' })).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe(
        messageForCode(IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED),
      );
      const recover = screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' });
      expect(recover.getAttribute('href')).toBe('/recuperar-contrasena');
      expect(document.activeElement).toBe(recover);
      expect(document.querySelector('[data-state="enlace-vencido"]')).toBeTruthy();
      await expectNoBlockingViolations();
    });

    it('CA-5: enlace-invalido no ofrece pedir otro enlace y lleva a iniciar sesión', async () => {
      openLink();
      fetchMock.mockResolvedValue(errorResponse(IDENTITY_ERROR_CODES.SETUP_LINK_INVALID, 422));

      render(<AccountSetupView apiPublicUrl={API} />);

      expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toBe(
        messageForCode(IDENTITY_ERROR_CODES.SETUP_LINK_INVALID),
      );
      const login = screen.getByRole('link', { name: 'Iniciar sesión' });
      expect(login.getAttribute('href')).toBe('/iniciar-sesion');
      expect(document.activeElement).toBe(login);
      expect(screen.queryByRole('link', { name: 'Pedir un enlace nuevo' })).toBeNull();
      expect(document.querySelector('[data-state="enlace-invalido"]')).toBeTruthy();
      await expectNoBlockingViolations();
    });

    it('sin token no llama a la API y queda en enlace-invalido', async () => {
      render(<AccountSetupView apiPublicUrl={API} />);

      expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('formulario de la primera contraseña', () => {
    async function openValidForm(): Promise<User> {
      openLink();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'valid' }));
      render(<AccountSetupView apiPublicUrl={API} />);
      await screen.findByRole('heading', { name: FORM_TITLE });
      return userEvent.setup();
    }

    async function fill(user: User, password: string, confirmation = password): Promise<void> {
      await user.type(screen.getByLabelText('Contraseña'), password);
      await user.type(screen.getByLabelText('Confirma la contraseña'), confirmation);
      await user.click(screen.getByRole('button', { name: SUBMIT }));
    }

    it('default: foco en la contraseña, requisitos en vivo y sin aviso de sesiones', async () => {
      const user = await openValidForm();

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByLabelText('Contraseña'));
      });
      expect(document.querySelector('[data-state="default"]')).toBeTruthy();
      expect(screen.queryByText(/sesiones/)).toBeNull();
      await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD);
      expect(screen.queryAllByText(': falta')).toEqual([]);
      await expectNoBlockingViolations();
    });

    it('si la confirmación no coincide no envía', async () => {
      const user = await openValidForm();

      await fill(user, STRONG_PASSWORD, 'Nimbo-Seguro-2027');

      expect(
        await screen.findByText(
          'Las contraseñas no coinciden. Escribe la misma en los dos campos.',
        ),
      ).toBeTruthy();
      expect(calledPaths()).toEqual(['/auth/account-setup/check']);
    });

    it('CA-5: una contraseña que no cumple la política no se envía', async () => {
      const user = await openValidForm();

      await fill(user, 'corta');

      expect(
        await screen.findByText(messageForCode(IDENTITY_ERROR_CODES.WEAK_PASSWORD)),
      ).toBeTruthy();
      expect(screen.getByLabelText('Contraseña').getAttribute('aria-invalid')).toBe('true');
      expect(calledPaths()).toEqual(['/auth/account-setup/check']);
    });

    it('CA-5: error-campos con lo que falta según la API, foco en la contraseña y el enlace sigue sirviendo', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            code: IDENTITY_ERROR_CODES.WEAK_PASSWORD,
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
      expect(document.activeElement).toBe(screen.getByLabelText('Contraseña'));
      expect(screen.getByRole('button', { name: SUBMIT })).toBeTruthy();
      await expectNoBlockingViolations();
    });

    it('enviando: el botón queda deshabilitado y con texto de carga', async () => {
      const user = await openValidForm();
      fetchMock.mockImplementationOnce(() => new Promise(() => undefined));

      await fill(user, STRONG_PASSWORD);

      const button = await screen.findByRole('button', { name: 'Creando contraseña' });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(document.querySelector('[data-state="enviando"]')).toBeTruthy();
    });

    it('CA-5: éxito envía token y contraseña y ofrece iniciar sesión con el foco', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'password-set' }));

      await fill(user, STRONG_PASSWORD);

      expect(await screen.findByRole('heading', { name: 'Contraseña creada' })).toBeTruthy();
      expect(screen.getByRole('status').textContent).toBe(
        'Listo. Ya puedes iniciar sesión con tu correo y la contraseña que elegiste.',
      );
      const login = screen.getByRole('link', { name: 'Iniciar sesión' });
      expect(login.getAttribute('href')).toBe('/iniciar-sesion');
      expect(document.activeElement).toBe(login);
      expect(calledPaths()).toEqual(['/auth/account-setup/check', '/auth/account-setup']);
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
        token: 'tok-1',
        password: STRONG_PASSWORD,
      });
      expect(document.querySelector('[data-state="exito"]')).toBeTruthy();
      await expectNoBlockingViolations();
    });

    it('CA-5: si el enlace vence antes de enviar, muestra enlace-vencido', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(errorResponse(IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED, 422));

      await fill(user, STRONG_PASSWORD);

      expect(await screen.findByRole('heading', { name: 'Enlace vencido' })).toBeTruthy();
    });

    it('un fallo del servidor muestra la alerta con el foco y conserva el formulario', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL_ERROR', 500));

      await fill(user, STRONG_PASSWORD);

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('No pudimos crear tu contraseña.');
      await waitFor(() => {
        expect(document.activeElement).toBe(alert);
      });
      expect(screen.getByRole('button', { name: SUBMIT })).toBeTruthy();
    });

    it('una respuesta fuera del contrato se trata como error del servidor', async () => {
      const user = await openValidForm();
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'otra-cosa' }));

      await fill(user, STRONG_PASSWORD);

      expect((await screen.findByRole('alert')).textContent).toContain(
        'No pudimos crear tu contraseña.',
      );
    });
  });
});
