/**
 * @jest-environment jsdom
 */
import type { FolderContentsResponse, FolderRef } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ALL_FILES_SCOPE, type AgentScope } from '../agent-scope';

import { AgentScopePicker, type AgentScopePickerProps } from './agent-scope-picker';

const AT = '2026-10-25T10:00:00.000Z';
const FINANZAS: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Finanzas' };
const LEGALES: FolderRef = { id: '1b2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Legales' };
const CIERRES: FolderRef = { id: '2a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Cierres' };
const PINNED = { id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b', name: 'Contrato_2026.pdf' };

const TREE: Readonly<Record<string, readonly FolderRef[]>> = {
  root: [FINANZAS, LEGALES],
  [FINANZAS.id]: [CIERRES],
  [LEGALES.id]: [],
  [CIERRES.id]: [],
};

function contentsOf(folderId: string | null): Promise<FolderContentsResponse> {
  const folders = TREE[folderId ?? 'root'] ?? [];
  return Promise.resolve({
    folder: null,
    breadcrumbs: [],
    items: folders.map((folder) => ({
      type: 'folder' as const,
      ...folder,
      parentId: folderId,
      createdAt: AT,
      updatedAt: AT,
    })),
    nextCursor: null,
  });
}

function renderPicker(overrides: Partial<AgentScopePickerProps> = {}): AgentScopePickerProps {
  const props: AgentScopePickerProps = {
    scope: ALL_FILES_SCOPE,
    folderContents: jest.fn(contentsOf),
    onChange: jest.fn(),
    ...overrides,
  };
  render(<AgentScopePicker {...props} />);
  return props;
}

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

async function blockingViolations(): Promise<readonly string[]> {
  const { violations } = await axe(document.body);
  return violations.filter((it) => BLOCKING_IMPACTS.has(it.impact ?? '')).map((it) => it.id);
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: /^Ámbito/ });
const option = (name: string): HTMLElement =>
  screen.getByRole('menuitemradio', { name: new RegExp(`^${name}`) });

describe('AgentScopePicker', () => {
  it('CA-14: el botón dice el ámbito vigente', () => {
    const folder: AgentScope = { type: 'folder', ...FINANZAS };
    const { unmount } = render(
      <AgentScopePicker scope={folder} folderContents={contentsOf} onChange={jest.fn()} />,
    );
    expect(trigger().textContent).toContain('Carpeta Finanzas');
    unmount();
    renderPicker({ scope: { type: 'file', ...PINNED }, pinnedFile: PINNED });
    expect(trigger().textContent).toContain(PINNED.name);
  });

  it('CA-14: abre un menú de tres opciones excluyentes con la vigente marcada', async () => {
    renderPicker();
    await userEvent.click(trigger());
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    expect(option('Todos mis archivos').getAttribute('aria-checked')).toBe('true');
    expect(option('Una carpeta').getAttribute('aria-checked')).toBe('false');
    expect(option('Un archivo').getAttribute('aria-checked')).toBe('false');
  });

  it('CA-14: elegir una carpeta del árbol entrega el ámbito con su id y su nombre', async () => {
    const props = renderPicker();
    await userEvent.click(trigger());
    await userEvent.click(option('Una carpeta'));
    const tree = await screen.findByRole('tree', { name: 'Carpetas' });
    expect(tree).toBeTruthy();
    await userEvent.click(await screen.findByRole('treeitem', { name: /^Finanzas/ }));
    expect(screen.queryByRole('treeitem', { selected: true, name: /^Finanzas/ })).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Usar esta carpeta' }));
    expect(props.onChange).toHaveBeenCalledWith({ type: 'folder', ...FINANZAS });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it('CA-14: en el árbol nada está deshabilitado y se recorre con el teclado', async () => {
    const props = renderPicker();
    await userEvent.click(trigger());
    await userEvent.click(option('Una carpeta'));
    await screen.findByRole('treeitem', { name: /^Finanzas/ });
    expect(screen.queryAllByRole('treeitem').filter((it) => it.ariaDisabled === 'true')).toEqual(
      [],
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /^Mis archivos/ })),
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Usar esta carpeta' }));
    expect(props.onChange).toHaveBeenCalledWith({ type: 'folder', ...FINANZAS });
  });

  it('CA-14: «Mis archivos» no es una carpeta: no se puede usar como ámbito de carpeta', async () => {
    renderPicker();
    await userEvent.click(trigger());
    await userEvent.click(option('Una carpeta'));
    await userEvent.click(await screen.findByRole('treeitem', { name: /^Mis archivos/ }));
    expect(screen.getByRole('button', { name: 'Usar esta carpeta' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('CA-14: cancelar el árbol no cambia el ámbito', async () => {
    const props = renderPicker();
    await userEvent.click(trigger());
    await userEvent.click(option('Una carpeta'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('CA-14: «Todos mis archivos» restablece el ámbito', async () => {
    const props = renderPicker({ scope: { type: 'folder', ...FINANZAS } });
    await userEvent.click(trigger());
    expect(option('Una carpeta').getAttribute('aria-checked')).toBe('true');
    expect(option('Una carpeta').textContent).toContain('Finanzas');
    await userEvent.click(option('Todos mis archivos'));
    expect(props.onChange).toHaveBeenCalledWith(ALL_FILES_SCOPE);
  });

  it('S-1: «Un archivo» usa el archivo fijado desde su ficha', async () => {
    const props = renderPicker({ pinnedFile: PINNED });
    await userEvent.click(trigger());
    expect(option('Un archivo').textContent).toContain(PINNED.name);
    await userEvent.click(option('Un archivo'));
    expect(props.onChange).toHaveBeenCalledWith({ type: 'file', ...PINNED });
  });

  it('S-1: sin archivo fijado, «Un archivo» aparece apagada con «Elígelo desde su ficha»', async () => {
    const props = renderPicker();
    await userEvent.click(trigger());
    expect(option('Un archivo').getAttribute('aria-disabled')).toBe('true');
    expect(option('Un archivo').textContent).toContain('Elígelo desde su ficha');
    await userEvent.click(option('Un archivo'));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('a11y: sin violaciones graves con el menú y con el árbol abiertos', async () => {
    renderPicker({ pinnedFile: PINNED });
    await userEvent.click(trigger());
    expect(await blockingViolations()).toEqual([]);
    await userEvent.click(option('Una carpeta'));
    await screen.findByRole('treeitem', { name: /^Finanzas/ });
    expect(await blockingViolations()).toEqual([]);
  });
});
