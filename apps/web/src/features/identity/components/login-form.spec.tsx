/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
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
});
