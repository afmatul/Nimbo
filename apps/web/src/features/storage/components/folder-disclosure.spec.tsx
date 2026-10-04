/**
 * @jest-environment jsdom
 */
import type { FolderContentsResponse, FolderRef, NodeSummary } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { LoadFolderContents } from '../hooks/use-folder-contents';
import { toFolderDisclosure, useFolderDisclosure } from '../hooks/use-folder-disclosure';

import { FileExplorer } from './file-explorer';

const AT = '2026-09-30T10:00:00.000Z';
const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3' };
const BETA: FolderRef = { id: '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a', name: 'Beta' };

const folder = (ref: FolderRef, parentId: string | null): NodeSummary => ({
  type: 'folder',
  ...ref,
  parentId,
  createdAt: AT,
});
const file = (id: string, name: string, folderId: string | null): NodeSummary => ({
  type: 'file',
  id,
  name,
  sizeBytes: 1_500,
  kind: 'pdf',
  folderId,
  createdAt: AT,
});

const ROOT_NODES = [folder(ALPHA, null), folder(BETA, null), file('f-root', 'raiz.pdf', null)];
const IN_ALPHA = [folder(FASE3, ALPHA.id), file('f-a', 'acta.pdf', ALPHA.id)];
const IN_FASE3 = [file('f-3', 'prompts.pdf', FASE3.id)];

function contents(items: readonly NodeSummary[]): FolderContentsResponse {
  return { folder: null, breadcrumbs: [], items: [...items], nextCursor: null };
}

function Harness({ load }: { readonly load: LoadFolderContents }): React.JSX.Element {
  const state = useFolderDisclosure(load);
  return (
    <main>
      <FileExplorer
        status="ready"
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
    const nameCell = (name: string): HTMLElement | null => rowOf(name).querySelector('td');
    expect(nameCell('Proyecto Alpha')?.className).toContain('pl-4');
    expect(nameCell('Fase 3')?.className).toMatch(/\bsm:pl-11\b/);
    expect(nameCell('acta.pdf')?.className).toMatch(/\bsm:pl-11\b/);
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
    expect(rowOf('prompts.pdf').querySelector('td')?.className).toMatch(/\bsm:pl-18\b/);
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

    expect(load).toHaveBeenLastCalledWith(ALPHA.id);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('acta.pdf')).toBeTruthy();
    expect(screen.getByText('Esta carpeta está vacía')).toBeTruthy();
  });

  it('CA-26: con teclado, Tab llega al control y Enter o Espacio desglosan y contraen', async () => {
    render(<Harness load={resolving} />);

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
});
