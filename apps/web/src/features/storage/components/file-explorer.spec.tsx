/**
 * @jest-environment jsdom
 */
import type { FileSummary, FolderRef, NodeSummary } from '@nimbo/contracts';
import userEvent from '@testing-library/user-event';
import { act, createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AgentProvider, useAgent } from '../../intelligence';
import { agentStatus } from '../../intelligence/test-agent';
import type { ListControls } from '../hooks/use-folder-contents';
import { DEFAULT_NODE_ORDER, type NodeOrder } from '../node-order';

import { FileExplorer, type FileExplorerProps } from './file-explorer';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const FILES: readonly FileSummary[] = [
  {
    id: 'f-1',
    name: 'Informe final.docx',
    sizeBytes: 1_500,
    kind: 'docx',
    folderId: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'f-2',
    name: 'foto.png',
    sizeBytes: 2_400_000,
    kind: 'imagen',
    folderId: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'f-3',
    name: 'notas.txt',
    sizeBytes: 12,
    kind: 'texto',
    folderId: null,
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
  },
];

const FILE_NODES: readonly NodeSummary[] = FILES.map((file) => ({ type: 'file', ...file }));

const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };
const PROMPTS: NodeSummary = {
  type: 'folder',
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Prompts',
  parentId: FASE3.id,
  createdAt: '2026-09-04T10:00:00.000Z',
  updatedAt: '2026-09-04T10:00:00.000Z',
};

let root: Root;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function renderExplorer(overrides: Partial<FileExplorerProps> = {}): Promise<void> {
  const props: FileExplorerProps = {
    status: 'ready',
    accessLevel: 'OWNER',
    folderId: null,
    breadcrumbs: [],
    nodes: [],
    maxFileLabel: '25 MB',
    onFiles: jest.fn(),
    onRetry: jest.fn(),
    onNewFolder: jest.fn(),
    ...overrides,
  };
  return mount(<FileExplorer {...props} />);
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Botón «${text}» no encontrado`);
  return found;
}

function rows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll('table tbody tr'));
}

function text(): string {
  return document.body.textContent ?? '';
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

function mockNoDrag(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
}

describe('FileExplorer (CA-1, CA-21)', () => {
  it('CA-1: estado vacío: título y máximo por archivo que llega por prop', async () => {
    await renderExplorer({ maxFileLabel: '25 MB' });

    expect(text()).toContain('Aún no tienes archivos');
    expect(text()).toContain(
      'Sube tus documentos con el botón o arrástralos a esta página. Tu plan permite hasta 25 MB por archivo.',
    );
    expect(rows()).toHaveLength(0);
  });

  it('CA-21: vacío sin máximo conocido: invita a subir sin inventar una cifra', async () => {
    await mount(
      <FileExplorer
        status="ready"
        accessLevel="OWNER"
        folderId={null}
        breadcrumbs={[]}
        nodes={[]}
        onFiles={jest.fn()}
        onRetry={jest.fn()}
        onNewFolder={jest.fn()}
      />,
    );

    expect(text()).toContain('Sube tus documentos con el botón o arrástralos a esta página.');
    expect(text()).not.toContain('Tu plan permite');
  });

  it('CA-21: estado cargando: anuncia «Cargando tus archivos…»', async () => {
    await renderExplorer({ status: 'loading' });

    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toContain('Cargando tus archivos…');
    expect(text()).not.toContain('Aún no tienes archivos');
  });

  it('CA-21: arrastre sobre la vista: «Suelta para subir» con el máximo del plan', async () => {
    await renderExplorer({ maxFileLabel: '25 MB' });
    const zone = document.querySelector<HTMLElement>('[data-testid="upload-dropzone"]');
    const event = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['Files'] } });

    await act(async () => {
      zone?.dispatchEvent(event);
    });

    expect(text()).toContain('Suelta para subir');
    expect(text()).toContain('Se guardarán en Mis archivos · hasta 25 MB por archivo');
  });

  it('CA-1: soltar archivos en la vista llama onFiles', async () => {
    const onFiles = jest.fn();
    await renderExplorer({ onFiles });
    const dropped = [new File(['pdf'], 'a.pdf')];
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: dropped, types: ['Files'] } });

    await act(async () => {
      document.querySelector('[data-testid="upload-dropzone"]')?.dispatchEvent(event);
    });

    expect(onFiles).toHaveBeenCalledWith(dropped);
  });

  it('CA-1: lista de la raíz: nombre, chip de tipo, tamaño legible y fecha', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    expect(document.querySelector('table caption')?.textContent).toBe(
      'Carpetas y archivos en Mis archivos',
    );
    expect(
      Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent),
    ).toEqual(['Nombre', 'Tamaño', 'Modificado', 'Acciones']);
    expect(rows()[0]?.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-09-01T10:00:00.000Z',
    );

    const [docx, image, texto] = rows();
    expect(rows()).toHaveLength(3);
    expect(docx?.textContent).toContain('Informe final.docx');
    expect(docx?.textContent).toContain('DOCX');
    expect(docx?.textContent).toContain('1,5 KB');
    expect(image?.textContent).toContain('IMG');
    expect(image?.textContent).toContain('2,4 MB');
    expect(texto?.textContent).toContain('TEXTO');
    expect(texto?.textContent).toContain('12 B');
  });

  it.each(['loading', 'error', 'empty'] as const)(
    'CA-21 (UI-7): el título del estado %s es h2, justo bajo el h1 de la página',
    async (state) => {
      await renderExplorer({ status: state === 'empty' ? 'ready' : state });

      expect(document.querySelector('h1')?.textContent).toBe('Mis archivos');
      expect(document.querySelectorAll('h2')).toHaveLength(1);
      expect(document.querySelector('h3')).toBeNull();
    },
  );

  it('CA-1 (UI-8): bajo sm el tamaño pasa a una segunda línea bajo el nombre y su columna se oculta', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    const sizeHeader = Array.from(document.querySelectorAll('thead th')).find(
      (cell) => cell.textContent === 'Tamaño',
    );
    const sizeCell = rows()[0]?.querySelectorAll('td')[1];
    for (const cell of [sizeHeader, sizeCell]) {
      expect(cell?.classList.contains('hidden')).toBe(true);
      expect(cell?.classList.contains('sm:table-cell')).toBe(true);
    }

    const secondLine = rows()[0]?.querySelector('[data-testid="file-size-mobile"]');
    expect(secondLine?.textContent).toMatch(/^1,5 KB · /);
    for (const token of ['text-xs', 'text-muted-foreground', 'sm:hidden']) {
      expect(secondLine?.classList.contains(token)).toBe(true);
    }
  });

  it('CA-21: sin renderRowActions no hay acciones por fila ni «Descargar»', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    expect(rows()[0]?.querySelector('button')).toBeNull();
    expect(text()).not.toContain('Descargar');
  });

  it('CA-21: renderRowActions pinta las acciones de cada fila', async () => {
    const renderRowActions = jest.fn((node: NodeSummary) => (
      <button type="button">{`Acciones de ${node.name}`}</button>
    ));
    await renderExplorer({ nodes: FILE_NODES, renderRowActions });

    expect(renderRowActions).toHaveBeenCalledTimes(3);
    expect(rows()[1]?.textContent).toContain('Acciones de foto.png');
  });

  it('CA-21: error: textos de la spec y «Reintentar» llama onRetry, sin correlationId', async () => {
    const onRetry = jest.fn();
    await renderExplorer({ status: 'error', onRetry });

    expect(text()).toContain('No pudimos cargar tus archivos.');
    expect(text()).toContain('Tus archivos siguen guardados. Inténtalo de nuevo.');
    expect(text()).not.toMatch(/correlation|código|soporte/i);

    await act(async () => buttonByText('Reintentar').click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('CA-21: en error «Subir archivos» sigue habilitado y abre el selector de archivos', async () => {
    const inputClick = jest
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await renderExplorer({ status: 'error' });

    const upload = buttonByText('Subir archivos');
    expect(upload.disabled).toBe(false);

    await act(async () => upload.click());
    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it('CA-1: «Subir archivos» abre el selector que comparte por fileInputRef', async () => {
    const fileInputRef = createRef<HTMLInputElement>();
    await renderExplorer({ fileInputRef });
    const inputClick = jest
      .spyOn(fileInputRef.current as HTMLInputElement, 'click')
      .mockImplementation(() => undefined);

    await act(async () => buttonByText('Subir archivos').click());

    expect(fileInputRef.current?.type).toBe('file');
    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it('CA-1: el vacío repite «Subir archivos», que también abre el selector', async () => {
    const inputClick = jest
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await renderExplorer();
    const [, emptyAction] = Array.from(document.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Subir archivos',
    );

    await act(async () => emptyAction?.click());
    expect(inputClick).toHaveBeenCalledTimes(1);
  });

  it('CA-21: sin arrastre (pantalla táctil) el vacío no menciona arrastrar', async () => {
    mockNoDrag(true);
    await renderExplorer({ maxFileLabel: '25 MB' });

    expect(text()).toContain(
      'Sube tus documentos desde tu dispositivo. Tu plan permite hasta 25 MB por archivo.',
    );
    expect(text()).not.toContain('arrástralos');
  });

  it('CA-21: pinta el aviso de descarga arriba de la lista', async () => {
    await renderExplorer({
      nodes: FILE_NODES,
      notice: <div role="alert">No encontramos «foto.png».</div>,
    });

    const zone = document.querySelector('[data-testid="upload-dropzone"]');
    const alert = zone?.querySelector('[role="alert"]');
    const list = zone?.querySelector('table');
    expect(alert?.textContent).toBe('No encontramos «foto.png».');
    expect(alert && list && alert.compareDocumentPosition(list)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('CA-21: sin aviso no deja un contenedor vacío', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    expect(document.querySelector('[data-testid="explorer-notice"]')).toBeNull();
  });

  it('CA-21: no muestra papelera, cuota ni desglose', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    expect(text()).not.toMatch(/Papelera|espacio|cuota|desglose/i);
  });

  it('CA-21: usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await renderExplorer({ nodes: FILE_NODES });

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});

describe('FileExplorer con carpetas (006: CA-1, CA-5, CA-6, CA-25)', () => {
  const inFase3 = { folderId: FASE3.id, breadcrumbs: [ALPHA, FASE3] } as const;

  it('CA-5: la carpeta abierta es el título y sus carpetas van primero, con «—» en Tamaño', async () => {
    await renderExplorer({ ...inFase3, nodes: [PROMPTS, ...FILE_NODES] });

    expect(document.querySelector('h1')?.textContent).toBe('Fase 3 · RAG');
    expect(document.querySelector('table caption')?.textContent).toBe(
      'Carpetas y archivos en Fase 3 · RAG',
    );
    const [folderRow] = rows();
    const link = folderRow?.querySelector('a');
    expect(link?.textContent).toBe('Prompts');
    expect(link?.getAttribute('href')).toBe(`/archivos/carpeta/${PROMPTS.id}`);
    expect(folderRow?.querySelectorAll('td')[1]?.textContent).toBe('—Carpeta, sin tamaño');
    expect(folderRow?.textContent).toContain('Carpeta · ');
  });

  it('CA-5: en móvil vuelve a la carpeta anterior por su nombre', async () => {
    await renderExplorer(inFase3);

    const back = document.querySelector('a[aria-label="Volver a Proyecto Alpha"]');
    expect(back?.getAttribute('href')).toBe(`/archivos/carpeta/${ALPHA.id}`);
    expect(text()).not.toMatch(/carpeta madre/i);
  });

  it('CA-5: la raíz no tiene enlace de regreso', async () => {
    await renderExplorer({ nodes: [PROMPTS] });

    expect(document.querySelector('a[aria-label^="Volver a"]')).toBeNull();
  });

  it('CA-1: «Nueva carpeta» llama onNewFolder', async () => {
    const onNewFolder = jest.fn();
    await renderExplorer({ ...inFase3, onNewFolder });

    await act(async () => buttonByText('Nueva carpeta').click());

    expect(onNewFolder).toHaveBeenCalledTimes(1);
  });

  it('CA-25: carpeta vacía: invita a subir o crear una subcarpeta', async () => {
    await renderExplorer(inFase3);

    expect(text()).toContain('Esta carpeta está vacía');
    expect(text()).toContain(
      'Sube documentos con el botón o arrástralos aquí, o crea una subcarpeta. Tu plan permite hasta 25 MB por archivo.',
    );
    expect(text()).not.toContain('Aún no tienes archivos');
  });

  it('CA-25: carpeta vacía en pantalla táctil no menciona arrastrar', async () => {
    mockNoDrag(true);
    await renderExplorer(inFase3);

    expect(text()).toContain('Sube documentos desde tu dispositivo o crea una subcarpeta.');
  });

  it('CA-25: cargando una carpeta: título en esqueleto y texto de la carpeta', async () => {
    await renderExplorer({ status: 'loading', folderId: FASE3.id, breadcrumbs: [] });

    expect(document.querySelector('h1')?.textContent).toBe('Cargando carpeta');
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Cargando el contenido de la carpeta…',
    );
  });

  it('CA-25: falla el listado de una carpeta: «No pudimos abrir esta carpeta.» con «Reintentar»', async () => {
    const onRetry = jest.fn();
    await renderExplorer({ status: 'error', folderId: FASE3.id, breadcrumbs: [], onRetry });

    expect(document.querySelector('h1')?.textContent).toBe('Carpeta');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos abrir esta carpeta.',
    );
    await act(async () => buttonByText('Reintentar').click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('CA-6: el arrastre dice que se guardarán en la carpeta abierta', async () => {
    await renderExplorer(inFase3);
    const event = new Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['Files'] } });

    await act(async () => {
      document.querySelector('[data-testid="upload-dropzone"]')?.dispatchEvent(event);
    });

    expect(text()).toContain('Se guardarán en Fase 3 · RAG · hasta 25 MB por archivo');
  });

  it('CA-25: la fila de carpeta usa solo tokens', async () => {
    await renderExplorer({ ...inFase3, nodes: [PROMPTS] });

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});

function statusTexts(): readonly string[] {
  return Array.from(document.querySelectorAll('[role="status"]')).map(
    (node) => node.textContent ?? '',
  );
}

function controls(overrides: Partial<ListControls> = {}): ListControls {
  return {
    order: DEFAULT_NODE_ORDER,
    shownOrder: DEFAULT_NODE_ORDER,
    sorting: false,
    more: 'idle',
    added: 0,
    hasMore: true,
    changeOrder: jest.fn(),
    loadMore: jest.fn(),
    dismissMoreError: jest.fn(),
    ...overrides,
  };
}

const BY_SIZE: NodeOrder = { sort: 'size', dir: 'desc' };

describe('FileExplorer: orden desde los encabezados (007 CA-10, CA-12)', () => {
  it('CA-10: no hay botón «Ordenar» aparte: el orden se pide desde la tabla', async () => {
    await renderExplorer({ nodes: FILE_NODES, controls: controls() });

    expect(document.querySelector('button[aria-haspopup="menu"][aria-expanded]')).toBeNull();
    expect(text()).not.toContain('Ordenar:');
    expect(document.querySelectorAll('th button')).toHaveLength(3);
  });

  it('CA-10: cada encabezado lleva una flecha; la de la columna activa marca la dirección', async () => {
    const byName: NodeOrder = { sort: 'name', dir: 'asc' };
    await renderExplorer({
      nodes: FILE_NODES,
      controls: controls({ order: byName, shownOrder: byName }),
    });

    expect(document.querySelectorAll('th button svg')).toHaveLength(3);
    expect(document.querySelectorAll('th button svg.lucide-arrow-up')).toHaveLength(1);
    expect(document.querySelectorAll('th button svg.lucide-arrow-up-down')).toHaveLength(2);
    expect(document.querySelector('th[aria-sort="ascending"]')?.textContent).toBe('Nombre');
  });

  it('CA-10: primer clic en «Tamaño», mayor primero; en la columna activa invierte', async () => {
    const changeOrder = jest.fn();
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ changeOrder }) });

    await userEvent.click(buttonByText('Tamaño'));

    expect(changeOrder).toHaveBeenCalledWith(BY_SIZE);
  });

  it('CA-10: pulsar la columna activa invierte la dirección', async () => {
    const changeOrder = jest.fn();
    await renderExplorer({
      nodes: FILE_NODES,
      controls: controls({ changeOrder, order: BY_SIZE, shownOrder: BY_SIZE }),
    });

    await userEvent.click(buttonByText('Tamaño'));

    expect(changeOrder).toHaveBeenCalledWith({ sort: 'size', dir: 'asc' });
  });

  it('CA-12: mientras llega otro orden la lista sigue visible y ocupada, y se anuncia', async () => {
    await renderExplorer({
      nodes: FILE_NODES,
      controls: controls({ order: BY_SIZE, sorting: true }),
    });

    expect(rows()).toHaveLength(3);
    expect(document.querySelector('[aria-busy="true"] table')).not.toBeNull();
    expect(statusTexts()).toContain('Ordenando por tamaño, mayor primero…');
  });

  it('CA-10: la tabla marca con aria-sort el orden que muestra, no el pedido', async () => {
    await renderExplorer({
      nodes: FILE_NODES,
      controls: controls({ order: BY_SIZE, sorting: true }),
    });

    expect(document.querySelectorAll('th[aria-sort]')).toHaveLength(0);
  });

  it('CA-10: pulsar el encabezado «Nombre» ordena por nombre', async () => {
    const changeOrder = jest.fn();
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ changeOrder }) });

    await userEvent.click(buttonByText('Nombre'));

    expect(changeOrder).toHaveBeenCalledWith({ sort: 'name', dir: 'asc' });
  });

  it('sin listado (cargando) no hay encabezados de orden ni «Cargar más»', async () => {
    await renderExplorer({ status: 'loading', controls: controls() });

    expect(document.querySelector('th button')).toBeNull();
    expect(text()).not.toContain('Cargar más');
  });
});

describe('FileExplorer: «Cargar más» (007 CA-9, CA-12)', () => {
  it('CA-9: «Cargar más» debajo de la lista pide la página siguiente', async () => {
    const loadMore = jest.fn();
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ loadMore }) });

    const button = buttonByText('Cargar más');
    const table = document.querySelector('table');
    expect(table && button.compareDocumentPosition(table)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    await userEvent.click(button);

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('CA-9: sin más páginas no hay «Cargar más»', async () => {
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ hasMore: false }) });

    expect(text()).not.toContain('Cargar más');
  });

  it('CA-9: anuncia cuántos elementos se agregaron, también tras la última página', async () => {
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ added: 20, hasMore: false }) });

    expect(statusTexts()).toContain('Se cargaron 20 elementos más.');
  });

  it('CA-12: cargando más: «Cargando más…» con aria-disabled, anuncio y la lista intacta', async () => {
    const loadMore = jest.fn();
    await renderExplorer({
      folderId: FASE3.id,
      breadcrumbs: [ALPHA, FASE3],
      nodes: FILE_NODES,
      controls: controls({ more: 'loading', loadMore }),
    });

    const button = buttonByText('Cargando más…');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(statusTexts()).toContain('Cargando más elementos de Fase 3 · RAG…');
    expect(rows()).toHaveLength(3);
    await userEvent.click(button);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('CA-12: si falla la página siguiente: aviso con «Reintentar» que conserva lo visible', async () => {
    const loadMore = jest.fn();
    const dismissMoreError = jest.fn();
    await renderExplorer({
      nodes: FILE_NODES,
      controls: controls({ more: 'error', loadMore, dismissMoreError }),
    });

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('No pudimos cargar más elementos.');
    expect(alert?.textContent).toContain(
      'Revisa tu conexión e inténtalo de nuevo. Lo que ya ves sigue aquí.',
    );
    expect(rows()).toHaveLength(3);
    expect(text()).not.toContain('Cargar más');
    await userEvent.click(buttonByText('Reintentar'));
    const close = document.querySelector<HTMLElement>('button[aria-label="Cerrar aviso"]');
    if (close) await userEvent.click(close);

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(dismissMoreError).toHaveBeenCalledTimes(1);
  });

  it('CA-12: el control de orden y el aviso usan solo tokens', async () => {
    await renderExplorer({ nodes: FILE_NODES, controls: controls({ more: 'error' }) });

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});

/** Lo que el panel tiene abierto: el ámbito vigente, o «cerrado». */
function AgentProbe(): ReactElement {
  const { isOpen, conversation } = useAgent();
  return (
    <output data-testid="agente">
      {isOpen ? JSON.stringify(conversation.state.scope) : 'cerrado'}
    </output>
  );
}

function renderWithAgent(overrides: Partial<FileExplorerProps>): Promise<void> {
  const deps = { loadStatus: jest.fn(() => Promise.resolve(agentStatus())), ask: jest.fn() };
  return mount(
    <AgentProvider deps={deps}>
      <FileExplorer
        status="ready"
        accessLevel="OWNER"
        folderId={null}
        breadcrumbs={[]}
        nodes={[]}
        onFiles={jest.fn()}
        onRetry={jest.fn()}
        onNewFolder={jest.fn()}
        {...overrides}
      />
      <AgentProbe />
    </AgentProvider>,
  );
}

function askButton(): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Preguntar sobre esto',
  );
}

describe('FileExplorer: «Preguntar sobre esto» (020b CA-15)', () => {
  it('CA-15: en una carpeta abre el panel con esa carpeta como ámbito', async () => {
    await renderWithAgent({ folderId: FASE3.id, breadcrumbs: [ALPHA, FASE3] });

    await userEvent.click(buttonByText('Preguntar sobre esto'));

    const probe = document.querySelector('[data-testid="agente"]');
    expect(JSON.parse(probe?.textContent ?? '')).toEqual({
      type: 'folder',
      id: FASE3.id,
      name: 'Fase 3 · RAG',
    });
  });

  it('en «Mis archivos» no aplica: la raíz no es una carpeta', async () => {
    await renderWithAgent({ folderId: null });

    expect(askButton()).toBeUndefined();
  });

  it('mientras no llega el nombre de la carpeta, todavía no aparece', async () => {
    await renderWithAgent({ status: 'loading', folderId: FASE3.id, breadcrumbs: [] });

    expect(askButton()).toBeUndefined();
  });

  it('sin la sesión del agente (roles internos) no aparece', async () => {
    await renderExplorer({ folderId: FASE3.id, breadcrumbs: [ALPHA, FASE3] });

    expect(askButton()).toBeUndefined();
  });
});
