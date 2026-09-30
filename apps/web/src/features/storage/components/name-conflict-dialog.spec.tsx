/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { NameConflictDialog, type NameConflictDialogProps } from './name-conflict-dialog';

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

function renderDialog(overrides: Partial<NameConflictDialogProps> = {}): Promise<void> {
  const props: NameConflictDialogProps = {
    open: true,
    fileName: 'informe.pdf',
    finalName: 'informe (1).pdf',
    othersCount: 0,
    onKeepBoth: jest.fn(),
    onDiscard: jest.fn(),
    ...overrides,
  };
  return mount(<NameConflictDialog {...props} />);
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === name);
  if (!found) throw new Error(`Botón «${name}» no encontrado`);
  return found;
}

function checkbox(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[type="checkbox"]');
}

function dialogText(): string {
  return document.querySelector('[role="alertdialog"]')?.textContent ?? '';
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('NameConflictDialog (CA-6, CA-22)', () => {
  it('CA-6: se titula «¿Conservar ambos archivos?» y muestra el nombre repetido y el final', async () => {
    await renderDialog();

    const title = document.querySelector('[data-slot="alert-dialog-title"]');
    expect(title?.textContent).toBe('¿Conservar ambos archivos?');
    expect(dialogText()).toContain(
      'Ya tienes un archivo llamado «informe.pdf». ¿Quieres conservar ambos o cancelar?',
    );
    expect(dialogText()).toContain(
      'Si conservas ambos, el nuevo se guardará como «informe (1).pdf».',
    );
  });

  it('CA-6: pone el foco inicial en «Conservar ambos»', async () => {
    await renderDialog();

    expect(document.activeElement).toBe(button('Conservar ambos'));
  });

  it('CA-6: ofrece «Conservar ambos» y «Cancelar», sin «Reemplazar»', async () => {
    await renderDialog();

    const labels = Array.from(document.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Conservar ambos', 'Cancelar']));
    expect(labels).not.toContain('Reemplazar');
  });

  it('CA-6: sin otros repetidos no muestra la casilla «Aplicar a los demás»', async () => {
    await renderDialog({ othersCount: 0 });

    expect(checkbox()).toBeNull();
    expect(dialogText()).not.toContain('Aplicar a los demás');
  });

  it('CA-6: con otro repetido usa la ayuda en singular', async () => {
    await renderDialog({ othersCount: 1 });

    const box = checkbox();
    expect(box).not.toBeNull();
    expect(box?.checked).toBe(false);
    expect(document.querySelector(`label[for="${box?.id ?? ''}"]`)?.textContent).toBe(
      'Aplicar a los demás',
    );
    const help = document.getElementById(box?.getAttribute('aria-describedby') ?? '');
    expect(help?.textContent).toBe(
      'Usaremos la misma respuesta para el otro archivo con nombre repetido.',
    );
    expect(dialogText()).toContain(
      'Usaremos la misma respuesta para el otro archivo con nombre repetido.',
    );
  });

  it('CA-6: con varios repetidos usa la ayuda en plural con n', async () => {
    await renderDialog({ othersCount: 3 });

    expect(dialogText()).toContain(
      'Usaremos la misma respuesta para los otros 3 archivos con nombre repetido.',
    );
  });

  it('CA-6: «Conservar ambos» emite onKeepBoth con applyToRest en falso por defecto', async () => {
    const onKeepBoth = jest.fn();
    const onDiscard = jest.fn();
    await renderDialog({ othersCount: 2, onKeepBoth, onDiscard });

    await act(async () => button('Conservar ambos').click());

    expect(onKeepBoth).toHaveBeenCalledTimes(1);
    expect(onKeepBoth).toHaveBeenCalledWith({ applyToRest: false });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('CA-6: con la casilla marcada, «Cancelar» emite onDiscard con applyToRest verdadero', async () => {
    const onKeepBoth = jest.fn();
    const onDiscard = jest.fn();
    await renderDialog({ othersCount: 2, onKeepBoth, onDiscard });

    await act(async () => checkbox()?.click());
    await act(async () => button('Cancelar').click());

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledWith({ applyToRest: true });
    expect(onKeepBoth).not.toHaveBeenCalled();
  });

  it('CA-6: la casilla marcada viaja también con «Conservar ambos»', async () => {
    const onKeepBoth = jest.fn();
    await renderDialog({ othersCount: 1, onKeepBoth });

    await act(async () => checkbox()?.click());
    await act(async () => button('Conservar ambos').click());

    expect(onKeepBoth).toHaveBeenCalledWith({ applyToRest: true });
  });

  it('CA-6: Escape equivale a «Cancelar»', async () => {
    const onDiscard = jest.fn();
    await renderDialog({ onDiscard });

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(onDiscard).toHaveBeenCalledWith({ applyToRest: false });
  });

  it('CA-6: al pasar a otro archivo la casilla vuelve a quedar sin marcar', async () => {
    const props: NameConflictDialogProps = {
      open: true,
      fileName: 'informe.pdf',
      finalName: 'informe (1).pdf',
      othersCount: 2,
      onKeepBoth: jest.fn(),
      onDiscard: jest.fn(),
    };
    await mount(<NameConflictDialog {...props} />);
    await act(async () => checkbox()?.click());
    expect(checkbox()?.checked).toBe(true);

    await act(async () =>
      root.render(<NameConflictDialog {...props} fileName="notas.pdf" finalName="notas (1).pdf" />),
    );

    expect(checkbox()?.checked).toBe(false);
  });

  it('no se muestra cuando open es falso', async () => {
    await renderDialog({ open: false });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await renderDialog({ othersCount: 2 });

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
