/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import {
  ConfirmDestructiveDialog,
  type ConfirmDestructiveDialogProps,
} from './confirm-destructive-dialog';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b|\[[^\]]*\]/i;

function renderDialog(overrides: Partial<ConfirmDestructiveDialogProps> = {}): {
  onOpenChange: jest.Mock;
  onConfirm: jest.Mock;
} {
  const onOpenChange = jest.fn();
  const onConfirm = jest.fn();
  render(
    <ConfirmDestructiveDialog
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="¿Cerrar la sesión en Safari · iOS?"
      description="Ese dispositivo tendrá que volver a iniciar sesión."
      confirmLabel="Cerrar sesión"
      {...overrides}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe('ConfirmDestructiveDialog (CA-14, CA-27)', () => {
  it('CA-27: es un alertdialog con nombre y descripción accesibles', () => {
    renderDialog();

    const dialog = screen.getByRole('alertdialog', { name: '¿Cerrar la sesión en Safari · iOS?' });
    expect(dialog.getAttribute('aria-describedby')).toBe(
      screen.getByText('Ese dispositivo tendrá que volver a iniciar sesión.').id,
    );
  });

  it('CA-27: el foco inicial queda en «Cancelar»', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('CA-14: Escape cancela sin confirmar', async () => {
    const { onOpenChange, onConfirm } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CA-14: «Cancelar» cierra sin confirmar', async () => {
    const { onOpenChange, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CA-14: confirmar usa la variante destructive y llama a onConfirm sin cerrarse solo', async () => {
    const { onOpenChange, onConfirm } = renderDialog();
    const confirm = screen.getByRole('button', { name: 'Cerrar sesión' });

    await userEvent.click(confirm);

    expect(confirm.className).toContain('bg-destructive');
    expect(confirm.className).not.toContain('bg-primary');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('CA-14: mientras envía, deshabilita ambos botones, muestra el texto de carga e ignora Escape', async () => {
    const { onOpenChange } = renderDialog({ pending: true, pendingLabel: 'Cerrando sesión…' });

    const confirm = screen.getByRole('button', { name: 'Cerrando sesión…' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('CA-27: a 360 px apila los botones con el destructivo arriba y en fila desde sm', () => {
    renderDialog();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Cerrar sesión' });
    const footer = cancel.parentElement;
    expect(footer).toBe(confirm.parentElement);
    expect(footer?.className).toContain('flex-col-reverse');
    expect(footer?.className).toContain('sm:flex-row');
    expect(footer?.lastElementChild).toBe(confirm);
  });

  it('CA-27: usa solo tokens y el velo del AlertDialog', () => {
    renderDialog();

    const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]');
    expect(overlay?.className).toContain('bg-foreground/40');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });

  it('CA-27: axe sin violaciones serias ni críticas', async () => {
    renderDialog();

    const results = await axe(document.body);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });

  it('CA-14: cerrado no muestra nada', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
