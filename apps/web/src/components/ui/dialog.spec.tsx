/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

function renderDialog(onOpenChange = jest.fn()): jest.Mock {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
          <DialogDescription>Se creará en Mis archivos.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>Cancelar</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  return onOpenChange;
}

describe('Dialog (shadcn/ui)', () => {
  it('es un diálogo modal con título y descripción accesibles', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Nueva carpeta' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Se creará en Mis archivos.')).toBeTruthy();
  });

  it('Escape y «Cancelar» piden cerrarlo', async () => {
    const onOpenChange = renderDialog();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('usa solo tokens de Cielo Sereno', () => {
    renderDialog();

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
