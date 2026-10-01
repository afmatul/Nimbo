/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type DownloadUrlResponse, type FileSummary } from '@nimbo/contracts';
import { axe } from 'jest-axe';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CancelUploadDialog } from './components/cancel-upload-dialog';
import { FileExplorer, type FileExplorerProps } from './components/file-explorer';
import { DownloadNoticeBanner, FileRowMenu, PREPARING_DELAY_MS } from './components/file-row-menu';
import { NameConflictDialog } from './components/name-conflict-dialog';
import { UploadPanel } from './components/upload-panel';
import type { StorageErrorDetails } from './storage-request-error';
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
        files={[]}
        maxFileLabel="25 MB"
        onFiles={jest.fn()}
        onRetry={jest.fn()}
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
      await renderExplorer({ files: [FILE], renderRowActions: (file) => rowMenu(file) });
      await openMenu();

      expect(document.querySelector('[role="menu"]')).not.toBeNull();
      await expectNoBlockingViolations();
    });
  });

  describe('descarga', () => {
    it('preparando: «Preparando…» tras 2 s sin respuesta', async () => {
      await renderExplorer({ files: [FILE], renderRowActions: (file) => rowMenu(file) });
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
        files: [FILE],
        renderRowActions: (file) => rowMenu(file),
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
});
