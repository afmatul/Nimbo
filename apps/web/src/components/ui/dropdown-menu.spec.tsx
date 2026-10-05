/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

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

function menu(disabled = false): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Acciones de informe.pdf">⋮</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled={disabled}>Descargar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function trigger(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!found) throw new Error('Disparador no encontrado');
  return found;
}

async function press(key: string): Promise<void> {
  const target = trigger();
  target.focus();
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('DropdownMenu (CA-13, CA-21)', () => {
  it.each([
    ['Enter', 'Enter'],
    ['Espacio', ' '],
  ])('se abre con %s y muestra el ítem', async (_name, key) => {
    await mount(menu());
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await press(key);

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const item = document.querySelector('[role="menuitem"]');
    expect(item?.textContent).toBe('Descargar');
    expect(item?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('marca el ítem deshabilitado con aria-disabled y data-disabled', async () => {
    await mount(menu(true));

    await press('Enter');

    const item = document.querySelector('[role="menuitem"]');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    expect(item?.hasAttribute('data-disabled')).toBe(true);
  });

  it('grupo de opciones: etiqueta, separador y menuitemradio con aria-checked (007 orden)', async () => {
    const onValueChange = jest.fn();
    await mount(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Ordenar">Ordenar</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel id="g-campo">Ordenar por</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value="name"
            onValueChange={onValueChange}
            aria-labelledby="g-campo"
          >
            <DropdownMenuRadioItem value="name">Nombre</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="size">Tamaño</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await press('Enter');

    const radios = Array.from(document.querySelectorAll('[role="menuitemradio"]'));
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(document.querySelector('[role="group"]')?.getAttribute('aria-labelledby')).toBe(
      'g-campo',
    );
    expect(document.querySelector('[role="separator"]')?.className).toContain('bg-border');
    await act(async () => (radios[1] as HTMLElement).click());
    expect(onValueChange).toHaveBeenCalledWith('size');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });

  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await mount(menu());

    await press('Enter');

    const content = document.querySelector('[role="menu"]')?.className ?? '';
    expect(content).toContain('bg-popover');
    expect(content).toContain('border-border');
    expect(document.querySelector('[role="menuitem"]')?.className).toContain('focus:bg-accent');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
