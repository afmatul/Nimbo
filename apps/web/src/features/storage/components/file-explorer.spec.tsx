/**
 * @jest-environment jsdom
 */
import type { FileSummary } from '@nimbo/contracts';
import { act, createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { FileExplorer, type FileExplorerProps } from './file-explorer';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const FILES: readonly FileSummary[] = [
  {
    id: 'f-1',
    name: 'Informe final.docx',
    sizeBytes: 1_500,
    kind: 'docx',
    createdAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'f-2',
    name: 'foto.png',
    sizeBytes: 2_400_000,
    kind: 'imagen',
    createdAt: '2026-09-02T10:00:00.000Z',
  },
  {
    id: 'f-3',
    name: 'notas.txt',
    sizeBytes: 12,
    kind: 'texto',
    createdAt: '2026-09-03T10:00:00.000Z',
  },
];

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
    files: [],
    maxFileLabel: '25 MB',
    onFiles: jest.fn(),
    onRetry: jest.fn(),
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
    await mount(<FileExplorer status="ready" files={[]} onFiles={jest.fn()} onRetry={jest.fn()} />);

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
    await renderExplorer({ files: FILES });

    expect(document.querySelector('table caption')?.textContent).toBe('Archivos de Mis archivos');
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
    expect(texto?.textContent).toContain('OTRO');
    expect(texto?.textContent).toContain('12 B');
  });

  it('CA-21: sin renderRowActions no hay acciones por fila ni «Descargar»', async () => {
    await renderExplorer({ files: FILES });

    expect(rows()[0]?.querySelector('button')).toBeNull();
    expect(text()).not.toContain('Descargar');
  });

  it('CA-21: renderRowActions pinta las acciones de cada fila', async () => {
    const renderRowActions = jest.fn((file: FileSummary) => (
      <button type="button">{`Acciones de ${file.name}`}</button>
    ));
    await renderExplorer({ files: FILES, renderRowActions });

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
      files: FILES,
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
    await renderExplorer({ files: FILES });

    expect(document.querySelector('[data-testid="explorer-notice"]')).toBeNull();
  });

  it('CA-21: no muestra carpetas, papelera, cuota ni desglose', async () => {
    await renderExplorer({ files: FILES });

    expect(text()).not.toMatch(/Carpetas|Papelera|espacio|cuota|desglose/i);
  });

  it('CA-21: usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await renderExplorer({ files: FILES });

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
