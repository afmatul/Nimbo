/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { errorResponse, jsonResponse } from '../../../lib/test-http';
import { createAuthFetch } from '../session/auth-fetch';

import { ChangePasswordForm } from './change-password-form';

const API = 'http://localhost/api/v1';
const CURRENT_PASSWORD = 'Lucia-Alpha-2025';
const STRONG_PASSWORD = 'Nimbo-Seguro-2026';

function seriousViolations(results: Awaited<ReturnType<typeof axe>>): unknown[] {
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe('ChangePasswordForm', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const authFetch = createAuthFetch({
    getAccessToken: () => 'token-a',
    renew: () => Promise.resolve(null),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  function renderForm(onChanged = jest.fn()): ReturnType<typeof render> {
    return render(
      <ChangePasswordForm apiPublicUrl={API} authFetch={authFetch} onChanged={onChanged} />,
    );
  }

  async function fill(values: {
    current?: string;
    next?: string;
    confirm?: string;
  }): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    await user.type(field('Contraseña actual'), values.current ?? CURRENT_PASSWORD);
    await user.type(field('Contraseña nueva'), values.next ?? STRONG_PASSWORD);
    await user.type(field('Confirma la contraseña nueva'), values.confirm ?? STRONG_PASSWORD);
    return user;
  }

  async function submit(values: Parameters<typeof fill>[0] = {}): Promise<void> {
    const user = await fill(values);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  }

  it('CA-22: default con la advertencia, los tres campos, los requisitos y la salida a la recuperación', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeTruthy();
    expect(
      screen.getByText('Al cambiarla cerraremos tus otras sesiones. Esta seguirá abierta.'),
    ).toBeTruthy();
    expect(field('Contraseña actual').getAttribute('autocomplete')).toBe('current-password');
    expect(field('Contraseña nueva').getAttribute('autocomplete')).toBe('new-password');
    expect(field('Confirma la contraseña nueva').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText('12 caracteres o más')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: '¿No la recuerdas? Restablece tu contraseña' })
        .getAttribute('href'),
    ).toBe('/recuperar-contrasena');
  });

  it('CA-22: contrasena-no-coincide no envía y marca la confirmación', async () => {
    renderForm();

    await submit({ confirm: 'Nimbo-Seguro-2027' });

    expect(
      await screen.findByText('Las contraseñas no coinciden. Escribe la misma en los dos campos.'),
    ).toBeTruthy();
    expect(field('Confirma la contraseña nueva').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CA-22: una contraseña nueva que no cumple la política no se envía', async () => {
    renderForm();

    await submit({ next: 'corta', confirm: 'corta' });

    expect(await screen.findByText('La contraseña no cumple todos los requisitos.')).toBeTruthy();
    expect(field('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CA-22: contrasena-enviando muestra el progreso, deja los campos de solo lectura y no reenvía', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    renderForm();
    const user = await fill({});

    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    const button = await screen.findByRole('button', { name: 'Cambiando contraseña…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Cambiando tu contraseña…');
    expect(field('Contraseña actual').readOnly).toBe(true);
    expect(field('Contraseña nueva').readOnly).toBe(true);
    expect(field('Confirma la contraseña nueva').readOnly).toBe(true);
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('CA-22: contrasena-cambiada envía solo la actual y la nueva, anuncia el éxito y vacía los campos', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));
    const onChanged = jest.fn();
    renderForm(onChanged);

    await submit();

    expect((await screen.findByRole('status')).textContent).toContain(
      'Cambiamos tu contraseña y cerramos tus otras sesiones.',
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${API}/auth/change-password`);
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: CURRENT_PASSWORD,
      newPassword: STRONG_PASSWORD,
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(field('Contraseña actual').value).toBe('');
    expect(field('Contraseña nueva').value).toBe('');
    expect(field('Confirma la contraseña nueva').value).toBe('');
  });

  it('CA-23: contrasena-incorrecta vacía la actual, le da el foco y conserva la nueva y la confirmación', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_WRONG_PASSWORD', 422));
    renderForm();

    await submit({ current: 'Otra-Clave-2025' });

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
    const current = field('Contraseña actual');
    expect(current.value).toBe('');
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(current);
    expect(field('Contraseña nueva').value).toBe(STRONG_PASSWORD);
    expect(field('Confirma la contraseña nueva').value).toBe(STRONG_PASSWORD);
  });

  it('CA-23: contrasena-bloqueada muestra los minutos que faltan según Retry-After', async () => {
    fetchMock.mockResolvedValue(
      errorResponse('IDENTITY_PASSWORD_CHANGE_LOCKED', 429, { 'retry-after': '540' }),
    );
    renderForm();

    await submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Hiciste demasiados intentos con una contraseña incorrecta. Espera 9 minutos o restablece tu contraseña.',
    );
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeTruthy();
  });

  it('CA-22: contrasena-debil marca la nueva con los requisitos que la API rechazó', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'IDENTITY_WEAK_PASSWORD',
          message: 'No',
          correlationId: 'c-1',
          fields: [{ field: 'newPassword', reason: 'PASSWORD_EQUALS_EMAIL', message: 'Igual' }],
        },
        422,
      ),
    );
    renderForm();

    await submit();

    expect(await screen.findByText('La contraseña no cumple todos los requisitos.')).toBeTruthy();
    expect(screen.getByText('Tu contraseña no puede ser tu correo.')).toBeTruthy();
    expect(field('Contraseña nueva').getAttribute('aria-invalid')).toBe('true');
    expect(field('Contraseña nueva').value).toBe(STRONG_PASSWORD);
  });

  it('un error inesperado muestra el genérico con el código para soporte', async () => {
    fetchMock.mockResolvedValue(errorResponse('INTERNAL_ERROR', 500));
    renderForm();

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No pudimos cambiar tu contraseña.');
    expect(alert.textContent).toContain('corr-prueba');
  });

  it('CA-27: sin violaciones de accesibilidad graves en default ni con errores', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_WRONG_PASSWORD', 422));
    const { container } = renderForm();
    expect(seriousViolations(await axe(container))).toEqual([]);

    await submit({ current: 'Otra-Clave-2025' });
    await screen.findByText('La contraseña actual no es correcta.');

    expect(seriousViolations(await axe(container))).toEqual([]);
  });
});
