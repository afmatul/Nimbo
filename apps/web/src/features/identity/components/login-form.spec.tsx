/**
 * @jest-environment jsdom
 */
import { SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
import { REQUEST_LINK_EMAIL_KEY, takeRequestLinkEmail } from '../request-link-email-storage';
import { forgetSession, recallSession } from '../session/session-memory';
import { sessionFixture } from '../session/test-session';

import { LoginForm } from './login-form';

const replace = jest.fn();
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

const API = 'http://localhost/api/v1';

async function expectNoSeriousViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(
    results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
}

async function submit(email = 'ana@ejemplo.com', password = 'UnaClaveSegura!1'): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe('LoginForm', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    push.mockReset();
    global.fetch = fetchMock;
    forgetSession();
    window.sessionStorage.clear();
  });

  describe('envío y éxito (T-88)', () => {
    it('CA-27: default con correo, contraseña, recuperar y sin violaciones serias', async () => {
      const view = render(<LoginForm apiPublicUrl={API} />);

      expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeTruthy();
      expect(screen.getByLabelText('Correo electrónico').getAttribute('type')).toBe('email');
      expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe('password');
      expect(
        screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).getAttribute('href'),
      ).toBe('/recuperar-contrasena');
      await expectNoSeriousViolations(view.container);
    });

    it('muestra u oculta la contraseña', async () => {
      const user = userEvent.setup();
      render(<LoginForm apiPublicUrl={API} />);

      await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
      expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe('text');
      await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
      expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe('password');
    });

    it('valida con loginRequestSchema y no llama a la API', async () => {
      const user = userEvent.setup();
      render(<LoginForm apiPublicUrl={API} />);

      await user.type(screen.getByLabelText('Correo electrónico'), 'ana');
      await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

      expect(
        await screen.findByText('Escribe un correo válido, por ejemplo nombre@dominio.com.'),
      ).toBeTruthy();
      expect(await screen.findByText('Completa este campo.')).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('enviando: botón deshabilitado y con texto de carga', async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      const button = await screen.findByRole('button', { name: 'Iniciando sesión' });
      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('CA-1: éxito → guarda la sesión en memoria y va a /archivos', async () => {
      const session = sessionFixture({ token: 'del-login' });
      fetchMock.mockResolvedValue(jsonResponse(session));
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith('/archivos');
      });
      expect(recallSession(Date.now())?.accessToken).toBe('del-login');
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe(`${API}/auth/login`);
      expect(init?.credentials).toBe('include');
      expect(window.sessionStorage.length).toBe(0);
      expect(window.localStorage.length).toBe(0);
    });

    it('CA-1: un rol interno va a /interno', async () => {
      fetchMock.mockResolvedValue(jsonResponse(sessionFixture({ role: 'SUPPORT' })));
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith('/interno');
      });
    });

    it('CA-2: credenciales inválidas → alerta con la acción de restablecer', async () => {
      fetchMock.mockResolvedValue(errorResponse('IDENTITY_INVALID_CREDENTIALS', 401));
      const view = render(<LoginForm apiPublicUrl={API} />);

      await submit();

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(
        'El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.',
      );
      expect(
        screen.getByRole('link', { name: 'Restablecer contraseña' }).getAttribute('href'),
      ).toBe('/recuperar-contrasena');
      expect(replace).not.toHaveBeenCalled();
      await expectNoSeriousViolations(view.container);
    });

    it('un fallo de red muestra el error genérico con el código', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      expect((await screen.findByRole('alert')).textContent).toContain(
        'comparte este código con soporte',
      );
    });
  });

  describe('estados de rechazo (T-89)', () => {
    it('CA-5: bloqueado con los minutos de Retry-After', async () => {
      fetchMock.mockResolvedValue(
        errorResponse('IDENTITY_LOGIN_LOCKED', 429, { 'retry-after': '540' }),
      );
      const view = render(<LoginForm apiPublicUrl={API} />);

      await submit();

      expect(
        await screen.findByText(
          'Hubo demasiados intentos fallidos. Espera 9 minutos o restablece tu contraseña.',
        ),
      ).toBeTruthy();
      expect(document.querySelector('[data-state="bloqueado"]')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'Restablecer contraseña' }).getAttribute('href'),
      ).toBe('/recuperar-contrasena');
      await expectNoSeriousViolations(view.container);
    });

    it('CA-6: límite por IP con el texto del inicio de sesión (DT-20)', async () => {
      fetchMock.mockResolvedValue(
        errorResponse('IDENTITY_TOO_MANY_REQUESTS', 429, { 'retry-after': '300' }),
      );
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      expect(
        await screen.findByText(
          'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
        ),
      ).toBeTruthy();
      expect(document.querySelector('[data-state="limite-ip"]')).toBeTruthy();
    });

    it('CA-3: no verificado → «Pedir un enlace nuevo» lleva a pedir-enlace con el correo en sessionStorage', async () => {
      const user = userEvent.setup();
      fetchMock.mockResolvedValue(errorResponse('IDENTITY_EMAIL_NOT_VERIFIED', 403));
      const view = render(<LoginForm apiPublicUrl={API} />);

      await submit('ana@ejemplo.com');

      expect(
        await screen.findByText(
          'Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.',
        ),
      ).toBeTruthy();
      expect(document.querySelector('[data-state="no-verificado"]')).toBeTruthy();
      await expectNoSeriousViolations(view.container);

      await user.click(screen.getByRole('button', { name: 'Pedir un enlace nuevo' }));

      expect(push).toHaveBeenCalledWith('/registro/pedir-enlace');
      expect(window.sessionStorage.getItem(REQUEST_LINK_EMAIL_KEY)).not.toBeNull();
      expect(takeRequestLinkEmail(window.sessionStorage, new Date())).toBe('ana@ejemplo.com');
    });

    it('CA-4: suspendida con el correo de contacto', async () => {
      fetchMock.mockResolvedValue(errorResponse('IDENTITY_ACCOUNT_SUSPENDED', 403));
      render(<LoginForm apiPublicUrl={API} />);

      await submit();

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(
        `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
      );
      expect(document.querySelector('[data-state="suspendida"]')).toBeTruthy();
    });

    it('CA-8: ?sesion=terminada muestra el aviso y desaparece al enviar', async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));
      const view = render(<LoginForm apiPublicUrl={API} sessionEnded />);

      expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeTruthy();
      expect(document.querySelector('[data-state="sesion-terminada"]')).toBeTruthy();
      await expectNoSeriousViolations(view.container);

      await submit();
      expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeNull();
    });
  });
});
