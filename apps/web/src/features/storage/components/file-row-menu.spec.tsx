/**
 * @jest-environment jsdom
 */
import { STORAGE_ERROR_CODES, type DownloadUrlResponse, type FileSummary } from '@nimbo/contracts';
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PREPARING_DELAY_MS } from '../../../lib/use-preparing-download';
import { StorageRequestError } from '../storage-request-error';

import {
  DownloadNoticeBanner,
  FileRowMenu,
  type DownloadNotice,
  type FileRowMenuProps,
} from './file-row-menu';

const SIGNED: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-09-01T10:05:00.000Z',
};
const NOT_FOUND = new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND);
const TOO_MANY = new StorageRequestError(429, STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS);

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const FILE: FileSummary = {
  id: 'f-1',
  name: 'Informe final.docx',
  sizeBytes: 1_500,
  kind: 'docx',
  folderId: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

interface Deferred {
  readonly promise: Promise<DownloadUrlResponse>;
  readonly resolve: (value: DownloadUrlResponse) => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<DownloadUrlResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let root: Root;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

type HarnessProps = Omit<FileRowMenuProps, 'file' | 'onNotice'> & {
  readonly onNotice?: (notice: DownloadNotice | null) => void;
};

function Harness({ onNotice, ...props }: HarnessProps): ReactElement {
  const [notice, setNotice] = useState<DownloadNotice | null>(null);
  const handleNotice = (next: DownloadNotice | null): void => {
    onNotice?.(next);
    setNotice(next);
  };
  return (
    <>
      {notice && <DownloadNoticeBanner notice={notice} onDismiss={() => handleNotice(null)} />}
      <FileRowMenu file={FILE} onNotice={handleNotice} {...props} />
    </>
  );
}

function renderMenu(overrides: Partial<HarnessProps> = {}): Promise<void> {
  const props: HarnessProps = {
    requestUrl: jest.fn(() => Promise.resolve(SIGNED)),
    onRefresh: jest.fn(),
    openUrl: jest.fn(),
    onRename: jest.fn(),
    onMove: jest.fn(),
    onMoveToTrash: jest.fn(),
    pin: { pinned: false, onToggle: jest.fn() },
    sharing: { level: 'OWNER', onShare: jest.fn() },
    ...overrides,
  };
  return mount(<Harness {...props} />);
}

function trigger(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (!found) throw new Error('Disparador no encontrado');
  return found;
}

function items(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Botón «${text}» no encontrado`);
  return found;
}

async function press(key: string): Promise<void> {
  const target = trigger();
  target.focus();
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

async function chooseDownload(): Promise<void> {
  await press('Enter');
  const item = items()[0];
  if (!item) throw new Error('Ítem «Descargar» no encontrado');
  await act(async () => item.click());
}

function alertBox(): HTMLElement | null {
  return document.querySelector('[role="alert"]');
}

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

describe('FileRowMenu (CA-13, CA-21)', () => {
  it('CA-13: el disparador se llama «Acciones de {nombre}» y «Descargar» es la primera acción', async () => {
    await renderMenu();

    expect(trigger().getAttribute('aria-label')).toBe('Acciones de Informe final.docx');
    await press('Enter');

    expect(items()[0]?.textContent?.trim()).toBe('Descargar');
  });

  it('006 CA-4, CA-7: «Renombrar» y «Mover a…» siguen a «Descargar» y abren su diálogo', async () => {
    const onRename = jest.fn();
    const onMove = jest.fn();
    await renderMenu({ onRename, onMove });
    await press('Enter');

    const labels = items().map((item) => item.textContent?.trim());
    expect(labels.slice(0, 4)).toEqual(['Descargar', 'Ver historial', 'Renombrar', 'Mover a…']);
    await act(async () => items()[2]?.click());
    expect(onRename).toHaveBeenCalledTimes(1);
    await press('Enter');
    await act(async () => items()[3]?.click());
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('014 CA-20: «Ver historial» sigue a «Descargar» y lleva a la ficha del archivo', async () => {
    await renderMenu();
    await press('Enter');

    const history = items()[1];
    expect(history?.textContent?.trim()).toBe('Ver historial');
    expect(history?.getAttribute('href')).toBe(`/archivos/archivo/${FILE.id}`);
  });

  it('016 CA-1: un .docx ofrece «Editar», que abre el editor del archivo', async () => {
    await renderMenu();
    await press('Enter');

    const edit = items().find((item) => item.textContent?.trim() === 'Editar');
    expect(edit?.getAttribute('href')).toBe(`/editor/${FILE.id}`);
  });

  it('016 CA-4: un archivo que no es .docx no ofrece «Editar»', async () => {
    await mount(
      <FileRowMenu
        file={{ ...FILE, name: 'Cuentas.xlsx', kind: 'xlsx' }}
        requestUrl={jest.fn()}
        onNotice={jest.fn()}
        onRefresh={jest.fn()}
        onRename={jest.fn()}
        onMove={jest.fn()}
        onMoveToTrash={jest.fn()}
        pin={{ pinned: false, onToggle: jest.fn() }}
        sharing={{ level: 'OWNER', onShare: jest.fn() }}
      />,
    );
    await press('Enter');

    expect(items().map((item) => item.textContent?.trim())).not.toContain('Editar');
  });

  it('006 CA-10: «Mover a la papelera» es la última acción, sin color destructivo', async () => {
    const onMoveToTrash = jest.fn();
    await renderMenu({ onMoveToTrash });
    await press('Enter');

    const last = items().at(-1);
    expect(last?.textContent?.trim()).toBe('Mover a la papelera');
    expect(last?.className).not.toMatch(/destructive/);
    await act(async () => last?.click());
    expect(onMoveToTrash).toHaveBeenCalledTimes(1);
  });

  it('006 CA-27: «Fijar en la barra lateral» va después de «Mover a…» y fija el archivo', async () => {
    const onToggle = jest.fn();
    await renderMenu({ pin: { pinned: false, onToggle } });
    await press('Enter');

    const labels = items().map((item) => item.textContent?.trim());
    expect(labels).toEqual([
      'Descargar',
      'Ver historial',
      'Renombrar',
      'Mover a…',
      'Fijar en la barra lateral',
      'Editar',
      'Compartir',
      'Mover a la papelera',
    ]);
    await act(async () => items()[4]?.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('006 CA-27: si ya está fijado, el ítem dice «Quitar de la barra lateral» (mockup menu-fila-quitar)', async () => {
    await renderMenu({ pin: { pinned: true, onToggle: jest.fn() } });
    await press('Enter');

    expect(items()[4]?.textContent?.trim()).toBe('Quitar de la barra lateral');
    expect(items()[4]?.getAttribute('aria-disabled')).toBeNull();
  });

  it.each([
    ['Enter', 'Enter'],
    ['Espacio', ' '],
  ])('CA-21: %s sobre el disparador abre el menú', async (_name, key) => {
    await renderMenu();
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await press(key);

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('CA-13: «Descargar» pide la URL del archivo, abre el enlace y cierra el menú', async () => {
    const requestUrl = jest.fn(() => Promise.resolve(SIGNED));
    const openUrl = jest.fn();
    await renderMenu({ requestUrl, openUrl });

    await chooseDownload();

    expect(requestUrl).toHaveBeenCalledWith('f-1');
    expect(openUrl).toHaveBeenCalledWith('https://objetos.local/firmada');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(alertBox()).toBeNull();
  });

  it('CA-21: antes de 2 s el ítem sigue habilitado y no se anuncia nada', async () => {
    const pending = deferred();
    await renderMenu({ requestUrl: () => pending.promise });
    jest.useFakeTimers();

    await chooseDownload();
    await act(async () => jest.advanceTimersByTime(PREPARING_DELAY_MS - 1));

    expect(PREPARING_DELAY_MS).toBe(2_000);
    expect(items()[0]?.textContent?.trim()).toBe('Descargar');
    expect(items()[0]?.hasAttribute('aria-disabled')).toBe(false);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('CA-21: si la URL tarda 2 s: «Preparando…» deshabilitado y anuncio; al llegar, abre el enlace', async () => {
    const pending = deferred();
    const openUrl = jest.fn();
    await renderMenu({ requestUrl: () => pending.promise, openUrl });
    jest.useFakeTimers();

    await chooseDownload();
    await act(async () => jest.advanceTimersByTime(PREPARING_DELAY_MS));

    const item = items()[0];
    expect(item?.textContent?.trim()).toBe('Preparando…');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toBe('Preparando la descarga de Informe final.docx…');

    await act(async () => pending.resolve({ ...SIGNED, url: 'https://objetos.local/lenta' }));

    expect(openUrl).toHaveBeenCalledWith('https://objetos.local/lenta');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('013b CA-3: doble clic en «Descargar»: una sola petición y el segundo no cierra ni limpia el aviso', async () => {
    const pending = deferred();
    const requestUrl = jest.fn(() => pending.promise);
    const onNotice = jest.fn();
    await renderMenu({ requestUrl, onNotice });

    await chooseDownload();
    await act(async () => items()[0]?.click());

    expect(requestUrl).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => pending.resolve(SIGNED));

    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('CA-21: 429: aviso arriba con el texto de la spec y «Reintentar» vuelve a pedir la URL', async () => {
    const requestUrl = jest.fn().mockRejectedValueOnce(TOO_MANY).mockResolvedValueOnce(SIGNED);
    const openUrl = jest.fn();
    await renderMenu({ requestUrl, openUrl });

    await chooseDownload();

    expect(alertBox()?.textContent).toContain(
      'No pudimos preparar la descarga de «Informe final.docx».',
    );
    expect(alertBox()?.textContent).toContain(
      'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    );
    expect(trigger()).toBeTruthy();

    await act(async () => buttonByText('Reintentar').click());

    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(requestUrl).toHaveBeenLastCalledWith('f-1');
    expect(openUrl).toHaveBeenCalledWith('https://objetos.local/firmada');
    expect(alertBox()).toBeNull();
  });

  it('CA-21: 404: «No encontramos…» y «Actualizar lista» llama onRefresh sin quitar la fila', async () => {
    const onRefresh = jest.fn();
    const requestUrl = jest.fn(() => Promise.reject(NOT_FOUND));
    await renderMenu({ requestUrl, onRefresh });

    await chooseDownload();

    expect(alertBox()?.textContent).toContain('No encontramos «Informe final.docx».');
    expect(alertBox()?.textContent).toContain(
      'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.',
    );

    await act(async () => buttonByText('Actualizar lista').click());

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(requestUrl).toHaveBeenCalledTimes(1);
    expect(trigger().getAttribute('aria-label')).toBe('Acciones de Informe final.docx');
  });

  it.each([
    ['red', new TypeError('Failed to fetch')],
    ['5xx', new StorageRequestError(503, 'SHARED_INTERNAL_ERROR')],
    ['fallo desconocido', new TypeError('Failed to fetch')],
  ])('CA-21: %s: texto de conexión con «Reintentar»', async (_name, error) => {
    const requestUrl = jest.fn(() => Promise.reject(error));
    await renderMenu({ requestUrl });

    await chooseDownload();

    expect(alertBox()?.textContent).toContain(
      'No pudimos preparar la descarga de «Informe final.docx».',
    );
    expect(alertBox()?.textContent).toContain('Revisa tu conexión e inténtalo de nuevo.');
    expect(buttonByText('Reintentar')).toBeTruthy();
  });

  it('CA-21: «Cerrar aviso» emite onNotice(null) y quita el aviso', async () => {
    const onNotice = jest.fn();
    await renderMenu({
      requestUrl: () => Promise.reject(TOO_MANY),
      onNotice,
    });
    await chooseDownload();

    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Cerrar aviso"]');
    await act(async () => close?.click());

    expect(onNotice).toHaveBeenLastCalledWith(null);
    expect(alertBox()).toBeNull();
  });

  it('CA-21: usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await renderMenu({ requestUrl: () => Promise.reject(TOO_MANY) });

    await chooseDownload();
    await press('Enter');

    expect(alertBox()?.className).toContain('border-destructive/40');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });

  it('012b CA-1: como propietario, «Compartir» abre el diálogo', async () => {
    const onShare = jest.fn();
    await renderMenu({ sharing: { level: 'OWNER', onShare } });
    await press('Enter');

    const share = items().find((item) => item.textContent?.trim() === 'Compartir');
    await act(async () => share?.click());

    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('012b CA-6: como Editor de un .docx solo ofrece «Descargar» y «Editar»', async () => {
    await renderMenu({ sharing: { level: 'EDITOR', onShare: jest.fn() } });
    await press('Enter');

    expect(items().map((item) => item.textContent?.trim())).toEqual(['Descargar', 'Editar']);
  });

  it('012b CA-6: como Lector solo ofrece «Descargar»', async () => {
    await renderMenu({ sharing: { level: 'VIEWER', onShare: jest.fn() } });
    await press('Enter');

    expect(items().map((item) => item.textContent?.trim())).toEqual(['Descargar']);
  });
});
