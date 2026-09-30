/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { UploadPhase, UploadView } from '../upload/upload-manager';

import { UploadPanel, type UploadPanelProps } from './upload-panel';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const MB = 1_000_000;

let root: Root;

function row(overrides: Partial<UploadView> & { phase: UploadPhase }): UploadView {
  return {
    id: 'upload-1',
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

function callbacks(): Omit<UploadPanelProps, 'rows'> {
  return {
    onPause: jest.fn(),
    onResume: jest.fn(),
    onRetry: jest.fn(),
    onRequestCancel: jest.fn(),
    onUploadAgain: jest.fn(),
    onClose: jest.fn(),
  };
}

function panel(props: Partial<UploadPanelProps> & Pick<UploadPanelProps, 'rows'>): ReactElement {
  return <UploadPanel {...callbacks()} {...props} />;
}

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

async function rerender(ui: ReactElement): Promise<void> {
  await act(async () => root.render(ui));
}

function text(): string {
  return document.body.textContent ?? '';
}

function button(name: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (element) => (element.getAttribute('aria-label') ?? element.textContent?.trim()) === name,
    ) ?? null
  );
}

function requireButton(name: string): HTMLButtonElement {
  const found = button(name);
  if (!found) throw new Error(`Botón «${name}» no encontrado`);
  return found;
}

function link(name: string): HTMLAnchorElement | null {
  return (
    [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
      (element) => element.textContent?.trim() === name,
    ) ?? null
  );
}

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('UploadPanel · cierre y minimizado (CA-21)', () => {
  it('CA-21: con cargas activas solo se minimiza; no hay «Cerrar»', async () => {
    const props = callbacks();
    await mount(
      <UploadPanel {...props} rows={[row({ phase: 'uploading', loadedBytes: 100 * MB })]} />,
    );

    expect(document.querySelector('h2')?.textContent).toBe('Subiendo 1 archivo');
    expect(button('Cerrar el panel de cargas')).toBeNull();

    const minimize = requireButton('Minimizar el panel de cargas');
    const list = document.getElementById(minimize.getAttribute('aria-controls') ?? '');
    expect(minimize.getAttribute('aria-expanded')).toBe('true');

    await act(async () => minimize.click());
    expect(minimize.getAttribute('aria-expanded')).toBe('false');
    expect(list?.hidden).toBe(true);
    expect(document.querySelector('h2')?.textContent).toBe('Subiendo 1 archivo');

    await act(async () => minimize.click());
    expect(list?.hidden).toBe(false);
  });

  it.each<UploadPhase>([
    'queued',
    'starting',
    'conflict',
    'uploading',
    'paused',
    'offline',
    'completing',
    'rate_limited',
  ])('CA-21: la fase activa %s impide cerrar aunque las demás hayan terminado', async (phase) => {
    await mount(
      panel({ rows: [row({ id: 'a', phase: 'done' }), row({ id: 'b', name: 'nota.txt', phase })] }),
    );

    expect(button('Cerrar el panel de cargas')).toBeNull();
    expect(button('Minimizar el panel de cargas')).not.toBeNull();
  });

  it('CA-21: sin cargas activas aparece «Cerrar» y las filas terminadas siguen visibles', async () => {
    const props = callbacks();
    await mount(
      <UploadPanel
        {...props}
        rows={[
          row({ id: 'a', name: 'hecho.pdf', phase: 'done', loadedBytes: 862 * MB }),
          row({ id: 'b', name: 'grande.mp4', phase: 'rejected', errorCode: 'STORAGE_EMPTY_FILE' }),
          row({ id: 'c', name: 'cancelada.docx', phase: 'cancelled' }),
          row({ id: 'd', name: 'vieja.xlsx', phase: 'expired' }),
        ]}
      />,
    );

    expect(document.querySelector('h2')?.textContent).toBe('Cargas terminadas');
    for (const name of ['hecho.pdf', 'grande.mp4', 'cancelada.docx', 'vieja.xlsx']) {
      expect(text()).toContain(name);
    }

    await act(async () => requireButton('Cerrar el panel de cargas').click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UploadPanel · progreso y acciones por fila (CA-21, CA-22)', () => {
  it('CA-21: muestra el chip de tipo, el porcentaje y los bytes de la fila', async () => {
    await mount(panel({ rows: [row({ phase: 'uploading', loadedBytes: 431 * MB })] }));

    expect(text()).toContain('PDF');
    expect(text()).toContain('50 %');
    expect(text()).toContain('431 MB de 862 MB');
    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      'Progreso de informe.pdf',
    );
  });

  it('CA-21: la velocidad es la media de lo enviado en los últimos 5 s', async () => {
    let clock = 0;
    const now = (): number => clock;
    await mount(panel({ now, rows: [row({ phase: 'uploading', loadedBytes: 0 })] }));

    clock = 2_000;
    await rerender(panel({ now, rows: [row({ phase: 'uploading', loadedBytes: 10 * MB })] }));

    expect(text()).toContain('5 MB/s');
    expect(text()).toContain('quedan');
  });

  it('CA-22: pausar y cancelar una carga en curso con nombres accesibles', async () => {
    const props = callbacks();
    await mount(<UploadPanel {...props} rows={[row({ phase: 'uploading', loadedBytes: MB })]} />);

    await act(async () => requireButton('Pausar la carga de informe.pdf').click());
    await act(async () => requireButton('Cancelar la carga de informe.pdf').click());

    expect(props.onPause).toHaveBeenCalledWith('upload-1');
    expect(props.onRequestCancel).toHaveBeenCalledWith('upload-1');
  });

  it('CA-22: una carga en pausa se reanuda y una simple avisa que se reiniciará', async () => {
    const props = callbacks();
    await mount(
      <UploadPanel
        {...props}
        rows={[row({ phase: 'paused', mode: 'simple', loadedBytes: MB, restartsOnResume: true })]}
      />,
    );

    expect(text()).toContain('Se reiniciará al reanudar');
    expect(button('Pausar la carga de informe.pdf')).toBeNull();

    await act(async () => requireButton('Reanudar la carga de informe.pdf').click());
    expect(props.onResume).toHaveBeenCalledWith('upload-1');
  });

  it('CA-6: una fila con nombre repetido muestra el nombre sugerido', async () => {
    await mount(
      panel({
        rows: [row({ phase: 'conflict', name: 'nota.txt', suggestedName: 'nota (1).txt' })],
      }),
    );

    expect(text()).toContain('nota (1).txt');
  });
});

describe('UploadPanel · corte de conexión (CA-8)', () => {
  it('CA-8: con una fila sin conexión el panel se titula «Carga en espera» y explica qué hacer', async () => {
    await mount(
      panel({
        rows: [
          row({ id: 'a', phase: 'uploading', loadedBytes: MB }),
          row({ id: 'b', name: 'nota.txt', phase: 'offline', loadedBytes: MB }),
        ],
      }),
    );

    expect(document.querySelector('h2')?.textContent).toBe('Carga en espera');
    expect(text()).toContain(
      'Se cortó la conexión. Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.',
    );
    expect(button('Reanudar la carga de nota.txt')).not.toBeNull();
  });
});

describe('UploadPanel · avisos de rechazo (CA-3, CA-4, CA-7, CA-9, CA-19)', () => {
  it('CA-3: tamaño con las cifras del servidor y sin botón de planes', async () => {
    await mount(
      panel({
        rows: [
          row({
            phase: 'rejected',
            errorCode: 'STORAGE_FILE_TOO_LARGE',
            errorDetails: { sizeBytes: 3_000_000_000, maxBytes: 2_000_000_000 },
          }),
        ],
      }),
    );

    expect(text()).toContain(
      'Este archivo pesa 3 GB y tu plan permite hasta 2 GB por archivo. Reduce su tamaño o cambia de plan.',
    );
    expect(text()).not.toContain('Ver planes');
  });

  it('CA-4: cuota con «Liberar espacio» hacia /archivos y sin «Ver planes»', async () => {
    await mount(
      panel({
        rows: [
          row({
            phase: 'rejected',
            errorCode: 'STORAGE_QUOTA_EXCEEDED',
            errorDetails: { missingBytes: 120 * MB },
          }),
        ],
      }),
    );

    expect(text()).toContain(
      'Te faltan 120 MB de espacio para subir este archivo. Libera espacio o cambia de plan.',
    );
    expect(link('Liberar espacio')?.getAttribute('href')).toBe('/archivos');
    expect(text()).not.toContain('Ver planes');
  });

  it('CA-7: un ejecutable tiene su propio aviso', async () => {
    await mount(
      panel({
        rows: [
          row({
            phase: 'rejected',
            errorCode: 'STORAGE_INVALID_FILE_TYPE',
            errorDetails: { reason: 'executable', extension: 'exe' },
          }),
        ],
      }),
    );

    expect(text()).toContain('No se permiten archivos ejecutables. Sube otro archivo.');
  });

  it('CA-7: un tipo que no coincide cita la extensión', async () => {
    await mount(
      panel({
        rows: [
          row({
            phase: 'rejected',
            errorCode: 'STORAGE_INVALID_FILE_TYPE',
            errorDetails: { reason: 'signature', extension: 'pdf' },
          }),
        ],
      }),
    );

    expect(text()).toContain(
      'Este archivo no es un .pdf válido. Comprueba que sea el archivo correcto.',
    );
  });

  it('CA-7: un archivo vacío', async () => {
    await mount(panel({ rows: [row({ phase: 'rejected', errorCode: 'STORAGE_EMPTY_FILE' })] }));

    expect(text()).toContain(
      'El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.',
    );
  });

  it('CA-9: una carga caducada ofrece «Subir de nuevo»', async () => {
    const props = callbacks();
    await mount(
      <UploadPanel
        {...props}
        rows={[row({ phase: 'expired', errorCode: 'STORAGE_UPLOAD_EXPIRED' })]}
      />,
    );

    expect(text()).toContain('Esta carga caducó. Vuelve a subir el archivo.');
    await act(async () => requireButton('Subir de nuevo').click());
    expect(props.onUploadAgain).toHaveBeenCalledTimes(1);
    expect(props.onRetry).not.toHaveBeenCalled();
  });

  it('CA-19: el límite de tasa ofrece «Reintentar» siempre habilitado y sin cuenta regresiva', async () => {
    const props = callbacks();
    await mount(
      <UploadPanel
        {...props}
        rows={[row({ phase: 'rate_limited', errorCode: 'STORAGE_TOO_MANY_REQUESTS' })]}
      />,
    );

    expect(text()).toContain(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    );
    const retry = requireButton('Reintentar');
    expect(retry.disabled).toBe(false);
    expect(text()).not.toMatch(/\d+\s*s\b/);

    await act(async () => retry.click());
    expect(props.onRetry).toHaveBeenCalledWith('upload-1');
  });

  it('CA-22: una fila cancelada explica que se liberó el espacio', async () => {
    await mount(panel({ rows: [row({ phase: 'cancelled' })] }));

    expect(text()).toContain('Cancelaste esta carga. Liberamos el espacio que tenía reservado.');
  });
});

describe('UploadPanel · tokens', () => {
  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await mount(
      panel({
        rows: [
          row({ id: 'a', phase: 'uploading', loadedBytes: MB }),
          row({ id: 'b', phase: 'offline', loadedBytes: MB }),
          row({
            id: 'c',
            phase: 'rejected',
            errorCode: 'STORAGE_QUOTA_EXCEEDED',
            errorDetails: { missingBytes: MB },
          }),
        ],
      }),
    );

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
