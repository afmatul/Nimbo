/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CancelUploadDialog, type CancelUploadDialogProps } from './cancel-upload-dialog';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

let root: Root;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function renderDialog(overrides: Partial<CancelUploadDialogProps> = {}): Promise<void> {
  const props: CancelUploadDialogProps = {
    open: true,
    uploadedLabel: '12 MB',
    totalLabel: '48 MB',
    fileName: 'informe.pdf',
    onConfirm: jest.fn(),
    onDismiss: jest.fn(),
    ...overrides,
  };
  return mount(<CancelUploadDialog {...props} />);
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name);
  if (!found) throw new Error(`Botón «${name}» no encontrado`);
  return found;
}

function dialogText(): string {
  return document.querySelector('[role="alertdialog"]')?.textContent ?? '';
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('CancelUploadDialog (CA-22)', () => {
  it('CA-22: se titula «¿Cancelar esta carga?» y muestra subido, total y nombre', async () => {
    await renderDialog();

    const title = document.querySelector('[data-slot="alert-dialog-title"]');
    expect(title?.textContent).toBe('¿Cancelar esta carga?');
    expect(dialogText()).toContain(
      'Ya subiste 12 MB de 48 MB de «informe.pdf». La pausamos mientras decides.',
    );
  });

  it('CA-22: explica que se pierde lo subido y se libera la reserva', async () => {
    await renderDialog();

    expect(dialogText()).toContain(
      'Si la cancelas, se perderá lo que ya subiste y liberaremos el espacio reservado. Para subir el archivo tendrás que empezar de cero.',
    );
  });

  it('CA-22: pone el foco inicial en «Seguir subiendo»', async () => {
    await renderDialog();

    expect(document.activeElement).toBe(button('Seguir subiendo'));
  });

  it('CA-22: «Cancelar carga» emite onConfirm', async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    await renderDialog({ onConfirm, onDismiss });

    await act(async () => button('Cancelar carga').click());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('CA-22: «Seguir subiendo» emite onDismiss', async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    await renderDialog({ onConfirm, onDismiss });

    await act(async () => button('Seguir subiendo').click());

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CA-22: Escape equivale a «Seguir subiendo»', async () => {
    const onDismiss = jest.fn();
    await renderDialog({ onDismiss });

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('no se muestra cuando open es falso', async () => {
    await renderDialog({ open: false });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await renderDialog();

    expect(button('Cancelar carga').className).toContain('bg-destructive');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
