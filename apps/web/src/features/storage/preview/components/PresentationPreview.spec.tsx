/** @jest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { startOoxmlWorker } from '../readers/ooxml-runtime';
import { ooxmlWorkerDouble, type OoxmlWorkerDouble } from '../readers/testing/ooxml-worker-double';

import { PresentationPreview } from './PresentationPreview';

jest.mock('../readers/ooxml-runtime', () => ({ startOoxmlWorker: jest.fn() }));

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const WAIT = { onTimeout: () => new Error('No se observó el estado PPTX esperado') };
const DECK = {
  kind: 'pptx',
  slides: [
    { index: 0, state: 'visible' },
    { index: 1, state: 'hidden' },
    { index: 2, state: 'visible' },
  ],
};
const FIRST = {
  index: 0,
  blocks: [
    { kind: 'text', text: 'Título\nSegunda línea' },
    {
      kind: 'table',
      rows: [
        ['A', 'B'],
        ['', 'C\nD'],
      ],
    },
    { kind: 'text', text: 'Después de la tabla' },
  ],
};
let workers: OoxmlWorkerDouble[];

function show() {
  const onFailure = jest.fn();
  const onReady = jest.fn();
  const view = render(<PresentationPreview url={URL} onFailure={onFailure} onReady={onReady} />);
  return { ...view, onFailure, onReady };
}

async function opened(preview: object = DECK): Promise<OoxmlWorkerDouble> {
  await waitFor(() => expect(workers).toHaveLength(1), WAIT);
  const worker = workers[0];
  if (worker === undefined) throw new Error('Falta worker');
  act(() => worker.opened(preview));
  return worker;
}

function navigation() {
  const nav = screen.getByRole('navigation', { name: 'Diapositivas' });
  return {
    status: () => within(nav).getByRole('status').textContent,
    previous: within(nav).getByRole('button', { name: 'Anterior' }),
    next: within(nav).getByRole('button', { name: 'Siguiente' }),
  };
}

describe('PresentationPreview T-09b: diapositivas en orden, solo texto y tablas', () => {
  beforeEach(() => {
    workers = [];
    jest.mocked(startOoxmlWorker).mockImplementation((options) => {
      const worker = ooxmlWorkerDouble();
      workers.push(worker);
      return worker.start(options);
    });
  });
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('CA-1: bloques en orden, saltos preservados y tabla accesible; índice actual/total', async () => {
    const { container, onReady } = show();
    const worker = await opened();
    expect(worker.state.options?.kind).toBe('pptx');
    expect(worker.requests()).toMatchObject([{ index: 0, offset: 0 }]);
    expect(navigation().status()).toBe('Diapositiva 1 de 3');
    expect(screen.getByText('Cargando diapositiva…').getAttribute('role')).toBe('status');
    act(() => worker.unit(FIRST));
    const slide = screen.getByRole('article', { name: 'Diapositiva 1' });
    const parts = [...slide.querySelectorAll('p,table')].map((element) =>
      element.tagName === 'TABLE'
        ? [...element.querySelectorAll('tr')].map((row) =>
            [...row.querySelectorAll('td')].map((cell) => cell.textContent),
          )
        : element.textContent,
    );
    expect(parts).toEqual([
      'Título\nSegunda línea',
      [
        ['A', 'B'],
        ['', 'C\nD'],
      ],
      'Después de la tabla',
    ]);
    expect(screen.getByRole('table', { name: 'Tabla 1 de la diapositiva 1' })).toBeTruthy();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img,canvas,svg:not([aria-hidden]),video,audio')).toBeNull();
    expect(container.innerHTML.includes('PRIVATE')).toBe(false);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-1/9: navega todas las diapositivas con botones; la oculta se indica y no se omite', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit(FIRST));
    const { previous, next } = navigation();
    expect(previous.hasAttribute('disabled')).toBe(true);
    await userEvent.click(next);
    expect(worker.requests().at(-1)).toMatchObject({ index: 1, offset: 0 });
    expect(navigation().status()).toBe('Diapositiva 2 de 3 · Oculta');
    expect(screen.getByText('Cargando diapositiva…')).toBeTruthy();
    act(() => worker.unit({ index: 1, blocks: [{ kind: 'text', text: 'Oculta pero visible' }] }));
    const slide = screen.getByRole('article', { name: 'Diapositiva 2' });
    expect(within(slide).getByText('Oculta')).toBeTruthy();
    expect(within(slide).getByText('Oculta pero visible')).toBeTruthy();
    next.focus();
    await userEvent.keyboard('{Enter}');
    act(() => worker.unit({ index: 2, blocks: [] }));
    expect(navigation().status()).toBe('Diapositiva 3 de 3');
    expect(next.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(previous);
    await userEvent.keyboard('{Enter}');
    expect(worker.requests().map(({ index }) => index)).toEqual([0, 1, 2, 1]);
  });

  it('CA-1: diapositiva sin bloques sigue navegable con un vacío discreto, sin inventar texto', async () => {
    show();
    const worker = await opened({ kind: 'pptx', slides: [{ index: 0, state: 'visible' }] });
    act(() => worker.unit({ index: 0, blocks: [] }));
    const slide = screen.getByRole('article', { name: 'Diapositiva 1' });
    expect(slide.textContent).toBe('Esta diapositiva no tiene texto para mostrar.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(navigation().status()).toBe('Diapositiva 1 de 1');
  });

  it('CA-7: cambio rápido de diapositiva descarta la respuesta obsoleta', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit(FIRST));
    await userEvent.click(navigation().next);
    await userEvent.click(navigation().next);
    const [, stale, latest] = worker.requests();
    act(() =>
      worker.unit({ index: 1, blocks: [{ kind: 'text', text: 'Obsoleta' }] }, stale?.request),
    );
    expect(screen.queryByText('Obsoleta')).toBeNull();
    expect(screen.getByText('Cargando diapositiva…')).toBeTruthy();
    act(() =>
      worker.unit({ index: 2, blocks: [{ kind: 'text', text: 'Vigente' }] }, latest?.request),
    );
    expect(screen.getByRole('article', { name: 'Diapositiva 3' }).textContent).toBe('Vigente');
  });

  it('CA-1/2: presentación sin diapositivas es éxito vacío; falla de memoria llega saneada', async () => {
    const empty = show();
    await opened({ kind: 'pptx', slides: [] });
    expect(screen.getByRole('status').textContent).toBe(
      'Este archivo no tiene contenido para mostrar.',
    );
    expect(empty.onReady).toHaveBeenCalledTimes(1);
    empty.unmount();
    workers = [];
    const { onFailure, container } = show();
    const worker = await opened();
    act(() => worker.failure('memory'));
    expect(onFailure.mock.calls).toEqual([[{ reason: 'memory', correlationId: '' }]]);
    expect(worker.state.terminated).toBe(1);
    expect(container.innerHTML).toBe('');
  });

  it('CA-2/11: metadata de otro formato o proyección inválida se rechazan como unavailable', async () => {
    const { onFailure, container } = show();
    await opened({ kind: 'xlsx', sheets: [] });
    expect(onFailure.mock.calls).toEqual([[{ reason: 'unavailable', correlationId: '' }]]);
    expect(container.innerHTML).toBe('');
  });

  it('CA-7: desmontar termina el worker y no hay callbacks tardíos', async () => {
    const { unmount, onFailure, onReady } = show();
    const worker = await opened();
    unmount();
    expect(worker.state.terminated).toBe(1);
    act(() => worker.unit(FIRST));
    act(() => worker.failure('corrupt'));
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });
});
