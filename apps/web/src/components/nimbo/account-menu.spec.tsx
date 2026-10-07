/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AccountMenu } from './account-menu';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const TRIGGER_NAME = 'Ana López (menú de la cuenta)';

function renderMenu(onSignOut: () => Promise<void> = jest.fn(() => Promise.resolve())): {
  onSignOut: () => Promise<void>;
} {
  render(<AccountMenu fullName="Ana López" email="ana@ejemplo.com" onSignOut={onSignOut} />);
  return { onSignOut };
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: TRIGGER_NAME });
}

async function openWithKeyboard(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  trigger().focus();
  await user.keyboard('{Enter}');
  return user;
}

async function openConfirmation(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = await openWithKeyboard();
  await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
  return user;
}

describe('AccountMenu (CA-14, CA-27)', () => {
  it('CA-27: es un menu button con el nombre de la cuenta, cerrado al inicio', () => {
    renderMenu();

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('CA-27: Enter abre con el foco en el primer ítem y las flechas recorren en ciclo', async () => {
    renderMenu();
    const button = trigger();

    const user = await openWithKeyboard();

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Seguridad' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Mi actividad' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Seguridad' }));
  });

  it('CA-27: Escape cierra el menú y devuelve el foco al botón', async () => {
    renderMenu();
    const user = await openWithKeyboard();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it('CA-27: el nombre y el correo van fuera del role="menu"; sin la ruta de Plan y facturación no se ofrece', async () => {
    renderMenu();

    await openWithKeyboard();

    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('ana@ejemplo.com')).toBeNull();
    expect(screen.getByText('ana@ejemplo.com')).toBeTruthy();
    expect(screen.getAllByText('Ana López').length).toBeGreaterThan(0);
    expect(within(menu).queryByText('Ana López')).toBeNull();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Seguridad',
      'Mi actividad',
      'Cerrar sesión',
    ]);
  });

  it('CA-14: «Seguridad» lleva a /cuenta/seguridad', async () => {
    renderMenu();

    await openWithKeyboard();

    expect(screen.getByRole('menuitem', { name: 'Seguridad' }).getAttribute('href')).toBe(
      '/cuenta/seguridad',
    );
  });

  it('004 CA-15: «Mi actividad», entre «Seguridad» y «Cerrar sesión», lleva a /actividad', async () => {
    renderMenu();

    await openWithKeyboard();

    expect(screen.getByRole('menuitem', { name: 'Mi actividad' }).getAttribute('href')).toBe(
      '/actividad',
    );
  });

  it('CA-14: «Cerrar sesión» pide confirmación antes de cerrar', async () => {
    const { onSignOut } = renderMenu();

    await openConfirmation();

    const dialog = await screen.findByRole('alertdialog', {
      name: '¿Cerrar la sesión en este dispositivo?',
    });
    expect(
      within(dialog).getByText('Tendrás que iniciar sesión de nuevo para volver a entrar.'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' })),
    );
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it('CA-14: al confirmar cierra la sesión una sola vez', async () => {
    const { onSignOut } = renderMenu();
    const user = await openConfirmation();

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it('CA-14: «Cancelar» no cierra la sesión y devuelve el foco al botón de la cuenta', async () => {
    const { onSignOut } = renderMenu();
    const user = await openConfirmation();

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onSignOut).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it('CA-27: axe sin violaciones serias ni críticas y solo tokens de Cielo Sereno', async () => {
    renderMenu();
    await openWithKeyboard();

    const results = await axe(document.body);

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking).toEqual([]);
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
