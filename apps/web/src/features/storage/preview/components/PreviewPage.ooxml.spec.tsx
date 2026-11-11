/** @jest-environment jsdom */
import type { PreviewUrlResponse } from '@nimbo/contracts';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps, ReactNode } from 'react';

import { startOoxmlWorker } from '../readers/ooxml-runtime';
import { ooxmlWorkerDouble, type OoxmlWorkerDouble } from '../readers/testing/ooxml-worker-double';

import { PreviewPage } from './PreviewPage';

jest.mock('../readers/ooxml-runtime', () => ({ startOoxmlWorker: jest.fn() }));
const authFetch = jest.fn();
const download = jest.fn();
jest.mock('../../../identity/session/use-auth-fetch', () => ({ useAuthFetch: () => authFetch }));
jest.mock('../..', () => ({ ...jest.requireActual('../..'), useFileDownload: () => download }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SIGNED = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const WAIT = { onTimeout: () => new Error('No se observó el estado OOXML esperado') };
const WORKBOOK = { kind: 'xlsx', sheets: [{ name: 'Datos', type: 'worksheet', state: 'visible' }] };
const SHEET = {
  index: 0,
  columns: 1,
  rows: [{ row: 1, cells: [{ column: 1, text: 'Valor', type: 'text' }] }],
  missingCache: 0,
};
const DECK = { kind: 'pptx', slides: [{ index: 0, state: 'visible' }] };
let workers: OoxmlWorkerDouble[];
let logs: jest.SpyInstance[];

function delivery(kind: 'xlsx' | 'pptx', id = ID): PreviewUrlResponse {
  return {
    file: {
      id,
      name: kind === 'xlsx' ? 'Cronograma.xlsx' : 'Avance.pptx',
      kind,
      folderId: null,
      sizeBytes: 100,
      createdAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
    },
    url: SIGNED,
    expiresAt: '2026-10-10T10:05:00.000Z',
  };
}

function page(fileId = ID, open = jest.fn()) {
  return (
    <PreviewPage fileId={fileId} apiPublicUrl="https://api.test/api/v1" openDownloadUrl={open} />
  );
}

function show() {
  const open = jest.fn();
  const view = render(page(ID, open), {
    wrapper: ({ children }: { readonly children: ReactNode }) => <main>{children}</main>,
  });
  return { ...view, open };
}

async function worker(index: number): Promise<OoxmlWorkerDouble> {
  await waitFor(() => expect(workers.length > index).toBe(true), WAIT);
  const value = workers[index];
  if (value === undefined) throw new Error('Falta worker');
  return value;
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: 'Vista previa' });
}

function privateDom(container: HTMLElement): void {
  expect(/PRIVATE_|X-Amz-Signature|private-object/.test(container.innerHTML)).toBe(false);
  expect(container.querySelector('iframe,object,embed')).toBeNull();
}

describe('PreviewPage con XLSX/PPTX: shell, worker OOXML y lifecycle integrados', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T10:00:00.000Z'));
    workers = [];
    jest.mocked(startOoxmlWorker).mockImplementation((options) => {
      const value = ooxmlWorkerDouble();
      workers.push(value);
      return value.start(options);
    });
    authFetch.mockReset().mockResolvedValue(delivery('xlsx'));
    download.mockReset().mockResolvedValue({ url: 'https://objects.test/download', expiresAt: '' });
    logs = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
  });
  afterEach(async () => {
    try {
      await act(async () => cleanup());
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('CA-1/9: XLSX queda busy hasta su primera unidad; Descargar sigue disponible y sin URL', async () => {
    const { container, open } = show();
    const a = await worker(0);
    expect(a.state.options?.url).toBe(SIGNED);
    expect(region().getAttribute('aria-busy')).toBe('true');
    act(() => a.opened(WORKBOOK));
    expect(region().getAttribute('aria-busy')).toBe('true');
    act(() => a.unit(SHEET));
    expect(region().getAttribute('aria-busy')).toBeNull();
    expect(screen.getByRole('cell', { name: 'Valor' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(download).toHaveBeenCalledWith(ID);
    expect(open).toHaveBeenCalledWith('https://objects.test/download');
    privateDom(container);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-9: PPTX lento muestra el progreso del shell pasados dos segundos hasta su unidad', async () => {
    authFetch.mockResolvedValue(delivery('pptx'));
    jest.useFakeTimers();
    try {
      show();
      const a = await worker(0);
      act(() => a.opened(DECK));
      expect(screen.queryByRole('progressbar')).toBeNull();
      act(() => jest.advanceTimersByTime(2001));
      expect(screen.getByRole('progressbar')).toBeTruthy();
      act(() => a.unit({ index: 0, blocks: [{ kind: 'text', text: 'Lista' }] }));
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(region().getAttribute('aria-busy')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('CA-2/7: XLSX corrupto usa el error del shell; Reintentar termina A antes de reemitir', async () => {
    const { container } = show();
    const a = await worker(0);
    act(() => a.failure('corrupt'));
    expect(screen.getByRole('heading', { name: 'No pudimos leer este archivo.' })).toBeTruthy();
    const actions = [...container.querySelectorAll('[role="alert"] button')];
    expect(actions.map((button) => button.textContent)).toEqual(['Descargar', 'Reintentar']);
    expect(a.state.terminated).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2), WAIT);
    const b = await worker(1);
    expect(a.state.options?.signal.aborted).toBe(true);
    expect(b.state.options?.signal.aborted).toBe(false);
    act(() => a.failure('memory'));
    act(() => b.opened(WORKBOOK));
    act(() => b.unit(SHEET));
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Valor' })).toBeTruthy();
    privateDom(container);
  });

  it('CA-2: PPTX con memoria agotada ofrece Descargar primero y Reintentar, sin contenido', async () => {
    authFetch.mockResolvedValue(delivery('pptx'));
    const { container } = show();
    const a = await worker(0);
    act(() => a.opened(DECK));
    act(() => a.failure('memory'));
    const actions = [
      ...container.querySelectorAll('[role="alert"] button, [role="status"] button'),
    ];
    expect(actions.map((button) => button.textContent)).toEqual(['Descargar', 'Reintentar']);
    expect(screen.queryByRole('article')).toBeNull();
    privateDom(container);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-2: falla de una diapositiva tras abrir y URL ya vencida se presenta como caducada', async () => {
    authFetch.mockResolvedValue(delivery('pptx'));
    show();
    const a = await worker(0);
    act(() => a.opened({ kind: 'pptx', slides: [...DECK.slides, { index: 1, state: 'visible' }] }));
    act(() => a.unit({ index: 0, blocks: [{ kind: 'text', text: 'Uno' }] }));
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    jest.mocked(Date.now).mockReturnValue(Date.parse('2026-10-10T10:06:00.000Z'));
    act(() => a.failure('unavailable'));
    expect(screen.getByRole('heading', { name: 'La vista previa caducó.' })).toBeTruthy();
    expect(screen.queryByText('Uno')).toBeNull();
  });

  it('CA-7: cambiar de archivo termina el worker anterior y descarta sus mensajes tardíos', async () => {
    const { rerender } = show();
    const a = await worker(0);
    act(() => a.opened(WORKBOOK));
    authFetch.mockResolvedValue(delivery('pptx', OTHER));
    rerender(page(OTHER));
    const b = await worker(1);
    expect(a.state.terminated).toBe(1);
    expect(a.state.options?.signal.aborted).toBe(true);
    act(() => a.unit(SHEET));
    act(() => a.failure('corrupt'));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    act(() => b.opened(DECK));
    act(() => b.unit({ index: 0, blocks: [{ kind: 'text', text: 'Otra' }] }));
    expect(screen.getByRole('article', { name: 'Diapositiva 1' }).textContent).toBe('Otra');
  });

  it('CA-7: desmontar termina el worker pendiente sin publicar failure ni logs', async () => {
    const { unmount, container } = show();
    const a = await worker(0);
    unmount();
    expect(a.state.terminated).toBe(1);
    act(() => a.opened(WORKBOOK));
    act(() => a.failure('corrupt'));
    expect(container.innerHTML).toBe('');
  });
});
