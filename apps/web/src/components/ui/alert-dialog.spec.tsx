/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

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

function dialog(): ReactElement {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger>Abrir</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar la carga?</AlertDialogTitle>
          <AlertDialogDescription>Se descartará lo subido.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Seguir subiendo</AlertDialogCancel>
          <AlertDialogAction>Cancelar carga</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name);
  if (!found) throw new Error(`Botón «${name}» no encontrado`);
  return found;
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('AlertDialog (CA-6, CA-22)', () => {
  it('abre con role="alertdialog" y lo nombra con su título y descripción', async () => {
    await mount(dialog());

    const content = document.querySelector('[role="alertdialog"]');
    const title = document.querySelector('[data-slot="alert-dialog-title"]');
    const description = document.querySelector('[data-slot="alert-dialog-description"]');
    expect(content).not.toBeNull();
    expect(content?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(content?.getAttribute('aria-describedby')).toBe(description?.id);
    expect(title?.textContent).toBe('¿Cancelar la carga?');
  });

  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await mount(dialog());

    const className = document.querySelector('[role="alertdialog"]')?.className ?? '';
    expect(className).toContain('bg-card');
    expect(className).toContain('border-border');
    expect(className).toContain('text-foreground');
    expect(button('Cancelar carga').className).toContain('bg-primary');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });

  it('pone el foco inicial en «Cancelar» y lo atrapa dentro del diálogo con Tab', async () => {
    await mount(dialog());
    expect(document.activeElement).toBe(button('Seguir subiendo'));

    const action = button('Cancelar carga');
    action.focus();
    await act(async () => {
      action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    expect(document.activeElement).toBe(button('Seguir subiendo'));
  });

  it('se cierra al elegir «Cancelar»', async () => {
    await mount(dialog());

    await act(async () => button('Seguir subiendo').click());

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
