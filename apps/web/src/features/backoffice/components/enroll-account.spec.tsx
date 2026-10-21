/**
 * @jest-environment jsdom
 */
import {
  IDENTITY_FIELD_MESSAGES,
  SHARED_ERROR_CODES,
  type AccountListItem,
  type EnrollInternalAccountRequest,
} from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { accountItem } from '../test-accounts';
import { apiError, enrollmentConflict, loadOf } from '../test-loads';

import { EnrollAccount } from './enroll-account';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

type EnrollMock = jest.Mock<Promise<AccountListItem>, [EnrollInternalAccountRequest]>;

const RODRIGO = {
  fullName: 'Rodrigo Pérez',
  email: 'rodrigo.perez@nimbo.gt',
  employeeCode: 'EMP-0142',
  role: 'SUPPORT',
} as const;

const CREATED = accountItem({
  id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  fullName: RODRIGO.fullName,
  email: RODRIGO.email,
  role: 'SUPPORT',
  planName: null,
  usedBytes: null,
});

const enrollOf = (...results: readonly (AccountListItem | Error)[]): EnrollMock =>
  loadOf<EnrollInternalAccountRequest, AccountListItem>(...results);

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

async function fill(values: Partial<Record<keyof typeof RODRIGO, string>>): Promise<void> {
  const user = userEvent.setup();
  if (values.fullName !== undefined) await user.type(field('Nombre completo'), values.fullName);
  if (values.email !== undefined) await user.type(field('Correo'), values.email);
  if (values.employeeCode !== undefined) {
    await user.type(field('Código de empleado'), values.employeeCode);
  }
  if (values.role !== undefined) await user.click(screen.getByRole('radio', { name: /^Soporte/ }));
}

/** Envía y espera a que `react-hook-form` valide (asíncrono) y la pantalla aplique el resultado, efectos incluidos. */
async function submit(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('EnrollAccount: alta de una cuenta interna (011 CA-5, CA-6, CA-17)', () => {
  it('CA-5: default: los cuatro campos, ningún rol marcado, sin Cliente y sin contraseña', () => {
    render(<EnrollAccount enroll={enrollOf()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Nueva cuenta interna' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a cuentas' }).getAttribute('href')).toBe(
      '/admin/cuentas',
    );
    expect(screen.getByText('Todos los campos son obligatorios.')).toBeTruthy();
    const roles = within(screen.getByRole('group', { name: 'Rol' })).getAllByRole('radio');
    expect(roles.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      'ADMIN',
      'SUPPORT',
      'OPERATOR',
    ]);
    expect(roles.some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(screen.queryByLabelText(/Contraseña/)).toBeNull();
    expect(screen.getByText('No hay contraseña que definir.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancelar' }).getAttribute('href')).toBe(
      '/admin/cuentas',
    );
  });

  it('CA-6: error-campos: no envía nada, resume los campos con el foco en el resumen y marca cada uno', async () => {
    const enroll = enrollOf();
    render(<EnrollAccount enroll={enroll} />);
    await fill({ email: 'rodrigo.perez.nimbo.gt', employeeCode: RODRIGO.employeeCode });

    await submit();

    expect(enroll).not.toHaveBeenCalled();
    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain('Revisa 3 campos para crear la cuenta.');
    expect(summary.textContent).toContain('Todavía no creamos nada.');
    expect(document.activeElement).toBe(summary);
    expect(field('Nombre completo').getAttribute('aria-invalid')).toBe('true');
    expect(field('Correo').getAttribute('aria-invalid')).toBe('true');
    expect(field('Código de empleado').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getAllByText('Escribe el nombre completo de la persona.').length).toBe(2);
    expect(screen.getAllByText('Elige el rol de la cuenta.').length).toBe(2);
    expect(
      within(summary).getByRole('link', { name: IDENTITY_FIELD_MESSAGES.INVALID_EMAIL }),
    ).toBeTruthy();
    const roleLink = within(summary).getByRole('link', { name: 'Elige el rol de la cuenta.' });
    const roleGroup = screen.getByRole('group', { name: 'Rol' });
    expect(roleLink.getAttribute('href')).toBe(`#${roleGroup.id}`);
    expect(roleGroup.getAttribute('tabindex')).toBe('-1');
  });

  it('CA-5: enviando: el botón ocupado, los campos de solo lectura y sin «Cancelar»', async () => {
    const enroll = enrollOf();
    render(<EnrollAccount enroll={enroll} />);
    await fill(RODRIGO);

    await submit();

    expect(enroll).toHaveBeenCalledWith(RODRIGO);
    expect(screen.getByRole('button', { name: 'Creando cuenta…' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(field('Nombre completo').readOnly).toBe(true);
    expect(screen.queryByRole('link', { name: 'Cancelar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Creando la cuenta de Rodrigo Pérez…');
  });

  it('CA-5: éxito: el mensaje con el foco en su título, el resumen y «Crear otra cuenta» vacía el formulario', async () => {
    render(<EnrollAccount enroll={enrollOf(CREATED)} />);
    await fill(RODRIGO);

    await submit();

    const title = screen.getByRole('heading', { name: 'Creamos la cuenta de Rodrigo Pérez.' });
    expect(document.activeElement).toBe(title);
    expect(screen.getByText(/Le enviamos un enlace a/).textContent).toBe(
      'Le enviamos un enlace a rodrigo.perez@nimbo.gt para que fije su contraseña.',
    );
    expect(screen.getByText('EMP-0142')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Volver a cuentas' }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Crear otra cuenta' }));

    expect(field('Nombre completo').value).toBe('');
    expect(document.activeElement).toBe(field('Nombre completo'));
  });

  it('CA-6: error-conflicto: dice qué datos están en uso, conserva lo escrito y enfoca el resumen', async () => {
    render(<EnrollAccount enroll={enrollOf(enrollmentConflict())} />);
    await fill(RODRIGO);

    await submit();

    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain(
      'No creamos la cuenta: el correo y el código de empleado ya están en uso.',
    );
    expect(summary.textContent).toContain(
      'Nada cambió. Corrige los campos marcados y vuelve a intentarlo.',
    );
    expect(document.activeElement).toBe(summary);
    expect(field('Correo').value).toBe(RODRIGO.email);
    expect(field('Correo').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(IDENTITY_FIELD_MESSAGES.EMAIL_IN_USE)).toBeTruthy();
    expect(screen.getByText(IDENTITY_FIELD_MESSAGES.EMPLOYEE_CODE_IN_USE)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Soporte/ })).toHaveProperty('checked', true);
  });

  it('CA-17: un error del servidor sin campos conserva lo escrito y dice qué hacer', async () => {
    render(<EnrollAccount enroll={enrollOf(new TypeError('Failed to fetch'))} />);
    await fill(RODRIGO);

    await submit();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos crear la cuenta.');
    expect(document.activeElement).toBe(alert);
    expect(field('Nombre completo').value).toBe(RODRIGO.fullName);
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeTruthy();
  });

  it('CA-14: un 403 muestra la pantalla común «Sin permiso»', async () => {
    render(<EnrollAccount enroll={enrollOf(apiError(403, SHARED_ERROR_CODES.FORBIDDEN))} />);
    await fill(RODRIGO);

    await submit();

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });
});
