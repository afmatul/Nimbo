/**
 * @jest-environment jsdom
 */
import {
  STORAGE_ERROR_CODES,
  type DownloadUrlResponse,
  type FileSummary,
  type FolderRef,
  type NodeSummary,
} from '@nimbo/contracts';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CancelUploadDialog } from './components/cancel-upload-dialog';
import { FileExplorer, type FileExplorerProps } from './components/file-explorer';
import { DownloadNoticeBanner, FileRowMenu, PREPARING_DELAY_MS } from './components/file-row-menu';
import { FolderBreadcrumbs } from './components/folder-breadcrumbs';
import { FolderNotFoundState } from './components/folder-not-found-state';
import { NameConflictDialog } from './components/name-conflict-dialog';
import { NewFolderDialog } from './components/new-folder-dialog';
import { UploadPanel } from './components/upload-panel';
import { StorageRequestError, type StorageErrorDetails } from './storage-request-error';
import type { UploadPhase, UploadView } from './upload/upload-manager';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);
const VIEWPORTS = [360, 1440] as const;
const MB = 1_000_000;
const FIXED_NOW = 1_790_000_000_000;

const FILE: FileSummary = {
  id: 'f-1',
  name: 'Informe final.docx',
  sizeBytes: 1_500,
  kind: 'docx',
  folderId: null,
  createdAt: '2026-09-01T10:00:00.000Z',
};

const FILE_NODE: NodeSummary = { type: 'file', ...FILE };
const ALPHA: FolderRef = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FASE3: FolderRef = { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', name: 'Fase 3 · RAG' };
const PROMPTS: NodeSummary = {
  type: 'folder',
  id: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  name: 'Prompts',
  parentId: FASE3.id,
  createdAt: '2026-09-01T10:00:00.000Z',
};

let root: Root | null = null;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(ui));
}

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

async function blockingViolations(): Promise<string[]> {
  // `next/link` actualiza su estado al observar la vista; axe corre dentro de `act` para no dejar avisos.
  const results = await act(async () => axe(document.body));
  return results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id} (${violation.impact}): ${node.html}`),
    );
}

/** Corre axe a 360 y 1440 px sobre lo que ya está montado. */
async function expectNoBlockingViolations(): Promise<void> {
  for (const width of VIEWPORTS) {
    setViewport(width);
    expect({ width, violations: await blockingViolations() }).toEqual({ width, violations: [] });
  }
}

function text(): string {
  return document.body.textContent ?? '';
}

beforeAll(() => {
  document.documentElement.lang = 'es';
  document.title = 'Mis archivos · Nimbo';
});

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function uploadRow(overrides: Partial<UploadView> & { phase: UploadPhase }): UploadView {
  return {
    id: `upload-${overrides.phase}`,
    name: 'informe.pdf',
    sizeBytes: 862 * MB,
    loadedBytes: 0,
    mode: 'multipart',
    suggestedName: null,
    restartsOnResume: false,
    awaitingCancel: false,
    errorCode: null,
    errorDetails: {},
    file: null,
    ...overrides,
  };
}

function rejected(id: string, errorCode: string, errorDetails: StorageErrorDetails): UploadView {
  return uploadRow({ id, phase: 'rejected', name: `${id}.pdf`, errorCode, errorDetails });
}

function renderPanel(rows: readonly UploadView[]): Promise<void> {
  return mount(
    <UploadPanel
      rows={rows}
      onPause={jest.fn()}
      onResume={jest.fn()}
      onRetry={jest.fn()}
      onRequestCancel={jest.fn()}
      onUploadAgain={jest.fn()}
      onClose={jest.fn()}
      now={() => FIXED_NOW}
    />,
  );
}

function renderExplorer(overrides: Partial<FileExplorerProps> = {}): Promise<void> {
  return mount(
    <main>
      <FileExplorer
        status="ready"
        folderId={null}
        breadcrumbs={[]}
        nodes={[]}
        maxFileLabel="25 MB"
        onFiles={jest.fn()}
        onRetry={jest.fn()}
        onNewFolder={jest.fn()}
        {...overrides}
      />
    </main>,
  );
}

const neverResolves = (): Promise<DownloadUrlResponse> => new Promise(() => undefined);

function rowMenu(file: FileSummary): ReactElement {
  return (
    <FileRowMenu
      file={file}
      requestUrl={neverResolves}
      onNotice={jest.fn()}
      onRefresh={jest.fn()}
      openUrl={jest.fn()}
      onRename={jest.fn()}
      onMove={jest.fn()}
    />
  );
}

function menuTrigger(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!found) throw new Error('Disparador del menú no encontrado');
  return found;
}

async function openMenu(): Promise<void> {
  const trigger = menuTrigger();
  trigger.focus();
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

describe('Accesibilidad de los estados de carga y descarga (CA-21)', () => {
  describe('panel de cargas', () => {
    it('progreso: fila subiendo con bytes y tamaño', async () => {
      await renderPanel([uploadRow({ phase: 'uploading', loadedBytes: 120 * MB })]);

      expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });

    it('pausa: fila en pausa que se reiniciará al reanudar', async () => {
      await renderPanel([
        uploadRow({ phase: 'paused', loadedBytes: 40 * MB, restartsOnResume: true }),
      ]);

      expect(text()).toContain('Se reiniciará al reanudar.');
      await expectNoBlockingViolations();
    });

    it('sin conexión: el panel se titula «Carga en espera»', async () => {
      await renderPanel([uploadRow({ phase: 'offline', loadedBytes: 300 * MB })]);

      expect(document.querySelector('h2')?.textContent).toBe('Carga en espera');
      await expectNoBlockingViolations();
    });

    it('rechazos: tamaño, cuota, ejecutable, firma y vacío', async () => {
      await renderPanel([
        rejected('grande', STORAGE_ERROR_CODES.STORAGE_FILE_TOO_LARGE, {
          sizeBytes: 862 * MB,
          maxBytes: 25 * MB,
        }),
        rejected('cuota', STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED, { missingBytes: 12 * MB }),
        rejected('ejecutable', STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE, {
          reason: 'executable',
        }),
        rejected('firma', STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE, {
          reason: 'signature',
          extension: 'pdf',
        }),
        rejected('vacio', STORAGE_ERROR_CODES.STORAGE_EMPTY_FILE, {}),
      ]);

      expect(text()).toContain('No se permiten archivos ejecutables.');
      expect(text()).toContain('Este archivo no es un .pdf válido.');
      expect(text()).toContain('Liberar espacio');
      await expectNoBlockingViolations();
    });

    it('caducada, límite de tasa, cancelada y nombre repetido', async () => {
      await renderPanel([
        uploadRow({ id: 'caducada', phase: 'expired' }),
        uploadRow({ id: 'tasa', phase: 'rate_limited' }),
        uploadRow({ id: 'cancelada', phase: 'cancelled' }),
        uploadRow({ id: 'repetido', phase: 'conflict', suggestedName: 'informe (1).pdf' }),
      ]);

      expect(text()).toContain('Subir de nuevo');
      expect(text()).toContain('Reintentar');
      expect(text()).toContain('Cancelaste esta carga.');
      expect(text()).toContain('«informe (1).pdf»');
      await expectNoBlockingViolations();
    });

    it('confirmar cancelar: la fila queda en pausa mientras el diálogo decide', async () => {
      await renderPanel([
        uploadRow({ phase: 'paused', loadedBytes: 120 * MB, awaitingCancel: true }),
      ]);

      expect(text()).toContain('en pausa');
      await expectNoBlockingViolations();
    });
  });

  describe('diálogos', () => {
    it('nombre repetido con otros 2 archivos', async () => {
      await mount(
        <NameConflictDialog
          open
          fileName="informe.pdf"
          finalName="informe (1).pdf"
          othersCount={2}
          onKeepBoth={jest.fn()}
          onDiscard={jest.fn()}
        />,
      );

      expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
      expect(text()).toContain('«informe (1).pdf»');
      await expectNoBlockingViolations();
    });

    it('confirmar cancelar la carga', async () => {
      await mount(
        <CancelUploadDialog
          open
          uploadedLabel="120 MB"
          totalLabel="862 MB"
          fileName="informe.pdf"
          onConfirm={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );

      expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });
  });

  describe('explorador', () => {
    it('vacío', async () => {
      await renderExplorer();

      expect(text()).toContain('Aún no tienes archivos');
      await expectNoBlockingViolations();
    });

    it('cargando', async () => {
      await renderExplorer({ status: 'loading' });

      expect(text()).toContain('Cargando tus archivos…');
      await expectNoBlockingViolations();
    });

    it('arrastre: «Suelta para subir»', async () => {
      await renderExplorer();
      const zone = document.querySelector<HTMLElement>('[data-testid="upload-dropzone"]');
      const event = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['Files'] } });

      await act(async () => {
        zone?.dispatchEvent(event);
      });

      expect(text()).toContain('Suelta para subir');
      await expectNoBlockingViolations();
    });

    it('error', async () => {
      await renderExplorer({ status: 'error' });

      expect(text()).toContain('No pudimos cargar tus archivos.');
      await expectNoBlockingViolations();
    });

    it('lista con acciones por fila (menú ⋮ abierto)', async () => {
      await renderExplorer({ nodes: [FILE_NODE], renderRowActions: () => rowMenu(FILE) });
      await openMenu();

      expect(document.querySelector('[role="menu"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });
  });

  describe('descarga', () => {
    it('preparando: «Preparando…» tras 2 s sin respuesta', async () => {
      await renderExplorer({ nodes: [FILE_NODE], renderRowActions: () => rowMenu(FILE) });
      await openMenu();
      jest.useFakeTimers();
      const item = document.querySelector<HTMLElement>('[role="menuitem"]');
      await act(async () => item?.click());
      await act(async () => jest.advanceTimersByTime(PREPARING_DELAY_MS));
      jest.useRealTimers();

      expect(document.querySelector('[role="menuitem"]')?.textContent?.trim()).toBe('Preparando…');
      await expectNoBlockingViolations();
    });

    it('fallida: aviso 404 con «Actualizar lista»', async () => {
      await renderExplorer({
        nodes: [FILE_NODE],
        renderRowActions: () => rowMenu(FILE),
        notice: (
          <DownloadNoticeBanner
            notice={{
              title: `No encontramos «${FILE.name}».`,
              description:
                'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.',
              actionLabel: 'Actualizar lista',
              onAction: jest.fn(),
            }}
            onDismiss={jest.fn()}
          />
        ),
      });

      expect(document.querySelector('[role="alert"]')?.textContent).toContain('Actualizar lista');
      await expectNoBlockingViolations();
    });
  });
  describe('carpetas (006 CA-25)', () => {
    const inFase3 = { folderId: FASE3.id, breadcrumbs: [ALPHA, FASE3] } as const;

    async function dragOver(): Promise<void> {
      const zone = document.querySelector<HTMLElement>('[data-testid="upload-dropzone"]');
      const event = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['Files'] } });
      await act(async () => {
        zone?.dispatchEvent(event);
      });
    }

    function renderDialog(createFolder: () => Promise<never>): Promise<void> {
      return mount(
        <NewFolderDialog
          open
          onOpenChange={jest.fn()}
          parentId={FASE3.id}
          destinationName={FASE3.name}
          siblingFolderNames={['Prompts']}
          createFolder={createFolder}
          onCreated={jest.fn()}
        />,
      );
    }

    async function submitName(name: string): Promise<void> {
      const input = document.querySelector<HTMLInputElement>('input[name="name"]');
      if (!input) throw new Error('Campo de nombre no encontrado');
      await userEvent.type(input, name);
      await userEvent.click(
        Array.from(document.querySelectorAll('button')).find(
          (button) => button.textContent === 'Crear carpeta',
        ) ?? input,
      );
    }

    it('raíz con carpetas primero y migas', async () => {
      await mount(
        <>
          <header>
            <FolderBreadcrumbs breadcrumbs={[]} />
          </header>
          <main>
            <FileExplorer
              status="ready"
              folderId={null}
              breadcrumbs={[]}
              nodes={[PROMPTS, FILE_NODE]}
              onFiles={jest.fn()}
              onRetry={jest.fn()}
              onNewFolder={jest.fn()}
            />
          </main>
        </>,
      );

      expect(document.querySelector('nav[aria-label="Ruta"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });

    it('carpeta con enlace de regreso, subcarpetas y archivos', async () => {
      await renderExplorer({ ...inFase3, nodes: [PROMPTS, FILE_NODE] });

      expect(document.querySelector('a[aria-label="Volver a Proyecto Alpha"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });

    it('carpeta vacía', async () => {
      await renderExplorer(inFase3);

      expect(text()).toContain('Esta carpeta está vacía');
      await expectNoBlockingViolations();
    });

    it('carpeta cargando', async () => {
      await renderExplorer({ status: 'loading', folderId: FASE3.id, breadcrumbs: [] });

      expect(text()).toContain('Cargando el contenido de la carpeta…');
      await expectNoBlockingViolations();
    });

    it('carpeta con error', async () => {
      await renderExplorer({ status: 'error', ...inFase3 });

      expect(text()).toContain('No pudimos abrir esta carpeta.');
      await expectNoBlockingViolations();
    });

    it('carpeta no encontrada', async () => {
      await mount(
        <main>
          <FolderNotFoundState />
        </main>,
      );

      expect(text()).toContain('No encontramos esta carpeta');
      await expectNoBlockingViolations();
    });

    it('arrastre sobre una carpeta', async () => {
      await renderExplorer(inFase3);
      await dragOver();

      expect(text()).toContain('Se guardarán en Fase 3 · RAG');
      await expectNoBlockingViolations();
    });

    it('nueva carpeta', async () => {
      await renderDialog(() => new Promise<never>(() => undefined));

      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });

    it('nombre inválido (400)', async () => {
      await renderDialog(() => new Promise<never>(() => undefined));
      await submitName('Resultados/finales');

      expect(document.querySelector('input[aria-invalid="true"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });

    it('nombre repetido (409)', async () => {
      await renderDialog(() =>
        Promise.reject(new StorageRequestError(409, STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT)),
      );
      await submitName('prompts');

      expect(text()).toContain('Ya existe una carpeta llamada «Prompts» aquí.');
      await expectNoBlockingViolations();
    });

    it('límite de niveles (422) con migas colapsadas', async () => {
      const deep = Array.from({ length: 10 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name: `Nivel ${String(index + 1)}`,
      }));
      await mount(
        <>
          <header>
            <FolderBreadcrumbs breadcrumbs={deep} />
          </header>
          <NewFolderDialog
            open
            onOpenChange={jest.fn()}
            parentId={deep[9]?.id ?? null}
            destinationName="Nivel 10"
            siblingFolderNames={[]}
            createFolder={() =>
              Promise.reject(
                new StorageRequestError(422, STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
                  maxDepth: 10,
                }),
              )
            }
            onCreated={jest.fn()}
          />
        </>,
      );
      await submitName('Anexos');

      expect(text()).toContain('Llegaste al máximo de 10 niveles de carpetas.');
      expect(
        document.querySelector('[aria-label="Mostrar 8 carpetas intermedias"]'),
      ).not.toBeNull();
      await expectNoBlockingViolations();
    });
  });
});
