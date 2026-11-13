/**
 * @jest-environment jsdom
 */
import type { FolderContentsResponse, FolderRef, NodeSummary } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { LoadFolderContents } from '../hooks/use-folder-contents';
import { toFolderDisclosure, useFolderDisclosure } from '../hooks/use-folder-disclosure';
import { DEFAULT_NODE_ORDER, type NodeOrder } from '../node-order';

import { FileExplorer } from './file-explorer';

const AT = '2026-09-30T10:00:00.000Z';
const BY_SIZE: NodeOrder = { sort: 'size', dir: 'desc' };
const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3' };
const BETA: FolderRef = { id: '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a', name: 'Beta' };

const folder = (ref: FolderRef, parentId: string | null): NodeSummary => ({
  type: 'folder',
  ...ref,
  parentId,
  createdAt: AT,
  updatedAt: AT,
});
const file = (id: string, name: string, folderId: string | null): NodeSummary => ({
  type: 'file',
  id,
  name,
  sizeBytes: 1_500,
  kind: 'pdf',
  folderId,
  createdAt: AT,
  updatedAt: AT,
});

const ROOT_NODES = [folder(ALPHA, null), folder(BETA, null), file('f-root', 'raiz.pdf', null)];
const IN_ALPHA = [folder(FASE3, ALPHA.id), file('f-a', 'acta.pdf', ALPHA.id)];
const IN_FASE3 = [file('f-3', 'prompts.pdf', FASE3.id)];

function contents(items: readonly NodeSummary[]): FolderContentsResponse {
  return {
    folder: null,
    breadcrumbs: [],
    items: [...items],
    nextCursor: null,
    accessLevel: 'OWNER',
  };
}

function Harness({
  load,
  order = DEFAULT_NODE_ORDER,
}: {
  readonly load: LoadFolderContents;
  readonly order?: NodeOrder;
}): React.JSX.Element {
  const state = useFolderDisclosure(load, order);
  return (
    <main>
      <FileExplorer
        status="ready"
        accessLevel="OWNER"
        folderId={null}
        breadcrumbs={[]}
        nodes={ROOT_NODES}
        onFiles={jest.fn()}
        onRetry={jest.fn()}
        onNewFolder={jest.fn()}
        disclosure={toFolderDisclosure(state, (_folderId, listed) => listed.items)}
      />
    </main>
  );
}

const byFolder: Readonly<Record<string, readonly NodeSummary[]>> = {
  [ALPHA.id]: IN_ALPHA,
  [FASE3.id]: IN_FASE3,
  [BETA.id]: [],
};

const resolving: LoadFolderContents = (folderId) =>
  Promise.resolve(contents(byFolder[folderId ?? ''] ?? []));

function toggleOf(name: string): HTMLElement {
  return screen.getByRole('button', { name: `Mostrar contenido de ${name}` });
}

function rowNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('a, span[title]')?.textContent ?? row.textContent ?? '');
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`Fila de «${name}» no encontrada`);
  return row;
}

/** Nivel de desglose de la fila (`--tree-level`), del que salen la sangría y las guías del token (CA-26). */
function levelOf(name: string): string {
  return rowOf(name).style.getPropertyValue('--tree-level');
}

describe('Desglosar carpetas en la lista (006 CA-26)', () => {
  it('CA-26: el control de desglose tiene nombre accesible y empieza contraído; el nombre sigue abriendo la carpeta', async () => {
    render(<Harness load={resolving} />);

    expect(toggleOf('Proyecto Alpha').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('link', { name: 'Proyecto Alpha' }).getAttribute('href')).toBe(
      `/archivos/carpeta/${ALPHA.id}`,
    );
    expect(screen.queryByRole('button', { name: /Mostrar contenido de raiz/ })).toBeNull();
  });

  it('CA-26: al desglosar muestra sus subcarpetas y archivos (carpetas primero) bajo la fila, con sangría y sin salir', async () => {
    render(<Harness load={resolving} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    expect(toggleOf('Proyecto Alpha').getAttribute('aria-expanded')).toBe('true');
    expect(rowNames()).toEqual(['Proyecto Alpha', 'Fase 3', 'acta.pdf', 'Beta', 'raiz.pdf']);
    expect(levelOf('Proyecto Alpha')).toBe('0');
    expect(levelOf('Fase 3')).toBe('1');
    expect(levelOf('acta.pdf')).toBe('1');
    expect(document.querySelector('h1')?.textContent).toBe('Mis archivos');
  });

  it('CA-26: el control apunta a las filas que muestra y cada fila dice dentro de qué carpeta está', async () => {
    render(<Harness load={resolving} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    const controlled = toggleOf('Proyecto Alpha').getAttribute('aria-controls')?.split(' ') ?? [];
    expect(controlled.map((id) => document.getElementById(id))).toEqual([
      rowOf('Fase 3'),
      rowOf('acta.pdf'),
    ]);
    expect(rowOf('acta.pdf').textContent).toContain(', dentro de Proyecto Alpha');
    expect(rowOf('raiz.pdf').textContent).not.toContain('dentro de');
  });

  it('CA-26: al contraer deja de ver el contenido', async () => {
    render(<Harness load={resolving} />);
    await userEvent.click(toggleOf('Proyecto Alpha'));

    await userEvent.click(toggleOf('Proyecto Alpha'));

    expect(toggleOf('Proyecto Alpha').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('acta.pdf')).toBeNull();
  });

  it('CA-26: una subcarpeta se desglosa a su vez (dos niveles) y lleva más sangría', async () => {
    render(<Harness load={resolving} />);
    await userEvent.click(toggleOf('Proyecto Alpha'));

    await userEvent.click(toggleOf('Fase 3'));

    expect(rowNames()).toEqual([
      'Proyecto Alpha',
      'Fase 3',
      'prompts.pdf',
      'acta.pdf',
      'Beta',
      'raiz.pdf',
    ]);
    expect(levelOf('prompts.pdf')).toBe('2');
  });

  it('CA-26: mientras carga, la fila anuncia «Cargando el contenido de …»', async () => {
    render(<Harness load={(id) => (id === null ? resolving(id) : new Promise(() => undefined))} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    const status = screen.getByText('Cargando el contenido de Proyecto Alpha…');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.closest('tr')?.previousElementSibling).toBe(rowOf('Proyecto Alpha'));
    expect(toggleOf('Proyecto Alpha').getAttribute('aria-busy')).toBe('true');
    expect(toggleOf('Proyecto Alpha').getAttribute('aria-controls')).toBe(status.closest('tr')?.id);
  });

  it('CA-26: una carpeta vacía lo dice en su fila', async () => {
    render(<Harness load={resolving} />);

    await userEvent.click(toggleOf('Beta'));

    expect(rowOf('Esta carpeta está vacía')).toBeTruthy();
  });

  it('CA-26: si falla, el error y «Reintentar» quedan solo en esa fila y reintentar la carga', async () => {
    const load = jest
      .fn<Promise<FolderContentsResponse>, [string | null]>()
      .mockRejectedValueOnce(new Error('red'))
      .mockImplementation(resolving);
    render(<Harness load={load} />);
    await userEvent.click(toggleOf('Proyecto Alpha'));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('No pudimos cargar el contenido de Proyecto Alpha.');
    const errorRow = alert.closest('tr') as HTMLElement;
    await userEvent.click(toggleOf('Beta'));
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);

    await userEvent.click(within(errorRow).getByRole('button', { name: 'Reintentar' }));

    expect(load).toHaveBeenLastCalledWith(ALPHA.id, { ...DEFAULT_NODE_ORDER, limit: 10 });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('acta.pdf')).toBeTruthy();
    expect(screen.getByText('Esta carpeta está vacía')).toBeTruthy();
  });

  it('CA-26: con teclado, Tab llega al control y Enter o Espacio desglosan y contraen', async () => {
    render(<Harness load={resolving} />);

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(toggleOf('Proyecto Alpha'));

    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('acta.pdf')).toBeTruthy();
    await userEvent.keyboard(' ');
    expect(screen.queryByText('acta.pdf')).toBeNull();
    expect(document.activeElement).toBe(toggleOf('Proyecto Alpha'));
  });

  it('CA-26: una respuesta que llega después de contraer no reabre la carpeta', async () => {
    let finish: (value: FolderContentsResponse) => void = () => undefined;
    render(
      <Harness
        load={() =>
          new Promise((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    await userEvent.click(toggleOf('Proyecto Alpha'));
    await userEvent.click(toggleOf('Proyecto Alpha'));

    await act(async () => finish(contents(IN_ALPHA)));

    expect(toggleOf('Proyecto Alpha').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('acta.pdf')).toBeNull();
  });

  it('CA-26: la sangría y las guías usan el token del desglose (tree-indent y tree-guides), sin clases por nivel', async () => {
    render(<Harness load={resolving} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    const cell = rowOf('acta.pdf').querySelector('td');
    expect(cell?.className.split(' ')).toContain('tree-guides');
    expect(cell?.querySelector('.tree-indent')).not.toBeNull();
    expect(cell?.className).not.toMatch(/\bsm:pl-11\b/);
  });

  it('CA-26: con más de una página, al final de su nivel hay una fila «Ver más» que lleva a la página de la carpeta', async () => {
    const paged: LoadFolderContents = (folderId) =>
      resolving(folderId).then((listed) =>
        folderId === ALPHA.id ? { ...listed, nextCursor: 'siguiente' } : listed,
      );
    render(<Harness load={paged} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    const more = screen.getByRole('link', { name: 'Ver más en Proyecto Alpha' });
    expect(more.getAttribute('href')).toBe(`/archivos/carpeta/${ALPHA.id}`);
    const moreRow = more.closest('tr') as HTMLElement;
    expect(moreRow.previousElementSibling).toBe(rowOf('acta.pdf'));
    expect(moreRow.nextElementSibling).toBe(rowOf('Beta'));
    expect(moreRow.style.getPropertyValue('--tree-level')).toBe('1');
    expect(toggleOf('Proyecto Alpha').getAttribute('aria-controls')?.split(' ')).toContain(
      moreRow.id,
    );
    expect(screen.queryByRole('button', { name: /Cargar más/ })).toBeNull();
  });

  it('007 CA-20: cada nivel se pide con el orden de la tabla y 10 elementos', async () => {
    const load = jest.fn(resolving);
    render(<Harness load={load} order={BY_SIZE} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    expect(load).toHaveBeenCalledWith(ALPHA.id, { sort: 'size', dir: 'desc', limit: 10 });
  });

  it('007 CA-20: al cambiar el orden vuelve a pedir los niveles abiertos con el orden nuevo', async () => {
    const load = jest.fn(resolving);
    const { rerender } = render(<Harness load={load} />);
    await userEvent.click(toggleOf('Proyecto Alpha'));
    load.mockClear();

    rerender(<Harness load={load} order={BY_SIZE} />);
    await act(async () => undefined);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(ALPHA.id, { sort: 'size', dir: 'desc', limit: 10 });
    expect(screen.getByText('acta.pdf')).toBeTruthy();
  });

  it('CA-26: sin más páginas no aparece «Ver más»', async () => {
    render(<Harness load={resolving} />);

    await userEvent.click(toggleOf('Proyecto Alpha'));

    expect(screen.getByText('acta.pdf')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Ver más/ })).toBeNull();
  });
});
