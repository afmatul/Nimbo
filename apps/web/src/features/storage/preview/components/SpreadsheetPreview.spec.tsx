/** @jest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { startOoxmlWorker } from '../readers/ooxml-runtime';
import { ooxmlWorkerDouble, type OoxmlWorkerDouble } from '../readers/testing/ooxml-worker-double';

import { SpreadsheetPreview } from './SpreadsheetPreview';

jest.mock('../readers/ooxml-runtime', () => ({ startOoxmlWorker: jest.fn() }));

const URL = 'https://objects.test/private-object?X-Amz-Signature=PRIVATE_SIGNATURE';
const WAIT = { onTimeout: () => new Error('No se observó el estado XLSX esperado') };
const WORKBOOK = {
  kind: 'xlsx',
  sheets: [
    { name: 'Cronograma', type: 'worksheet', state: 'visible' },
    { name: 'Gráfico', type: 'chartsheet', state: 'visible' },
    { name: 'Apoyo', type: 'worksheet', state: 'hidden' },
    { name: 'Interna', type: 'worksheet', state: 'veryHidden' },
  ],
};
const cell = (column: number, text: string, type = 'text') => ({ column, text, type });
const SHEET = {
  index: 0,
  columns: 4,
  rows: [
    { row: 1, cells: [cell(1, 'Fase'), cell(4, 'Avance')] },
    { row: 3, cells: [cell(1, 'Uno'), cell(4, '35 %', 'percent')] },
  ],
  missingCache: 0,
};
let workers: OoxmlWorkerDouble[];

function show() {
  const onFailure = jest.fn();
  const onReady = jest.fn();
  const view = render(<SpreadsheetPreview url={URL} onFailure={onFailure} onReady={onReady} />);
  return { ...view, onFailure, onReady };
}

async function opened(preview: object = WORKBOOK): Promise<OoxmlWorkerDouble> {
  await waitFor(() => expect(workers).toHaveLength(1), WAIT);
  const worker = workers[0];
  if (worker === undefined) throw new Error('Falta worker');
  act(() => worker.opened(preview));
  return worker;
}

function grid(): HTMLElement {
  return screen.getByRole('table', { name: /valores guardados/ });
}

function rowsOf(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole('row')
    .map((row) => [...row.querySelectorAll('th,td')].map((item) => item.textContent ?? ''));
}

describe('SpreadsheetPreview T-09b: hojas, ventanas y celdas ya formateadas', () => {
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

  it('CA-1: hojas en orden con Oculta/Muy oculta; tabla dispersa con fila y columna reales', async () => {
    const { onReady, container } = show();
    const worker = await opened();
    expect(worker.state.options?.kind).toBe('xlsx');
    expect(worker.requests()).toEqual([
      { type: 'unit', session: worker.session(), request: 1, index: 0, offset: 0 },
    ]);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Cronograma',
      'Gráfico',
      'ApoyoOculta',
      'InternaMuy oculta',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Cargando celdas…');
    expect(onReady).not.toHaveBeenCalled();
    act(() => worker.unit(SHEET));
    expect(rowsOf(grid())).toEqual([
      ['Fila', 'A', 'D'],
      ['1', 'Fase', 'Avance'],
      ['3', 'Uno', '35 %'],
    ]);
    expect(screen.getByText('Hoja 1 de 4 · valores guardados')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Filas de la hoja' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(container.innerHTML.includes('PRIVATE')).toBe(false);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('CA-1/9: la hoja se elige con clic o teclado (flechas, Inicio, Fin) y pide su unidad', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit(SHEET));
    await userEvent.click(screen.getByRole('tab', { name: 'Apoyo Oculta' }));
    expect(worker.requests().at(-1)).toMatchObject({ index: 2, offset: 0 });
    expect(screen.queryByRole('table')).toBeNull();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('InternaMuy oculta');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement?.textContent).toBe('Cronograma');
    await userEvent.keyboard('{End}');
    await userEvent.keyboard('{Home}');
    await userEvent.keyboard('{ArrowLeft}');
    expect(worker.requests().map(({ index }) => index)).toEqual([0, 2, 3, 0, 3, 0, 3]);
    const selected = screen.getByRole('tab', { selected: true });
    expect(document.activeElement).toBe(selected);
    // Tabulación itinerante: solo la pestaña seleccionada entra en el orden de Tab.
    expect(
      screen.getAllByRole('tab').map((tab) => [tab === selected, tab.getAttribute('tabindex')]),
    ).toEqual(
      screen.getAllByRole('tab').map((tab) => [tab === selected, tab === selected ? '0' : '-1']),
    );
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(selected.id);
  });

  it('CA-7: el recorrido de ventanas de una hoja no se arrastra a otra, que empieza en 0', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit({ ...SHEET, nextOffset: 200 }));
    await userEvent.click(screen.getByRole('button', { name: 'Filas siguientes' }));
    act(() => worker.unit({ ...SHEET, rows: [{ row: 201, cells: [cell(1, 'A201')] }] }));
    await userEvent.click(screen.getByRole('tab', { name: 'Apoyo Oculta' }));
    expect(worker.requests().at(-1)).toMatchObject({ index: 2, offset: 0 });
    act(() => worker.unit({ ...SHEET, index: 2, nextOffset: 200 }));
    const nav = screen.getByRole('navigation', { name: 'Filas de la hoja' });
    expect(
      within(nav).getByRole('button', { name: 'Filas anteriores' }).hasAttribute('disabled'),
    ).toBe(true);
    await userEvent.click(within(nav).getByRole('button', { name: 'Filas siguientes' }));
    expect(worker.requests().at(-1)).toMatchObject({ index: 2, offset: 200 });
  });

  it('CA-7: cambio rápido de hoja nunca muestra la unidad obsoleta', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit(SHEET));
    await userEvent.click(screen.getByRole('tab', { name: 'Apoyo Oculta' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Interna Muy oculta' }));
    const [, stale, latest] = worker.requests();
    act(() => worker.unit({ ...SHEET, index: 2 }, stale?.request));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Cargando celdas…');
    act(() =>
      worker.unit(
        { ...SHEET, index: 3, rows: [{ row: 9, cells: [cell(2, 'Vigente')] }] },
        latest?.request,
      ),
    );
    expect(rowsOf(grid())).toEqual([
      ['Fila', 'B'],
      ['9', 'Vigente'],
    ]);
  });

  it('CA-1/7: avanza y retrocede por ventanas del reader sin mostrar la anterior mientras carga', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit({ ...SHEET, nextOffset: 200 }));
    const nav = screen.getByRole('navigation', { name: 'Filas de la hoja' });
    const previous = within(nav).getByRole('button', { name: 'Filas anteriores' });
    expect(previous.hasAttribute('disabled')).toBe(true);
    expect(within(nav).getByRole('status').textContent).toBe('Filas 1 a 3');
    await userEvent.click(within(nav).getByRole('button', { name: 'Filas siguientes' }));
    expect(worker.requests().at(-1)).toMatchObject({ index: 0, offset: 200 });
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(nav).getByRole('status').textContent).toBe('Cargando filas…');
    act(() => worker.unit({ ...SHEET, rows: [{ row: 201, cells: [cell(1, 'Ventana 2')] }] }));
    expect(rowsOf(grid())[1]).toEqual(['201', 'Ventana 2']);
    const next = within(nav).getByRole('button', { name: 'Filas siguientes' });
    expect(next.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(previous);
    await userEvent.click(previous);
    expect(worker.requests().at(-1)).toMatchObject({ index: 0, offset: 0 });
    // Volver a la primera ventana deshabilita Anterior: el foco pasa a Siguiente, ya conocida.
    expect(next.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(next);
    await userEvent.click(next);
    expect(worker.requests()).toHaveLength(3);
    act(() => worker.unit({ ...SHEET, nextOffset: 200 }));
    expect(rowsOf(grid())[1]).toEqual(['1', 'Fase', 'Avance']);
    expect(previous.hasAttribute('disabled')).toBe(true);
    await userEvent.click(next);
    expect(worker.requests().at(-1)).toMatchObject({ index: 0, offset: 200 });
  });

  it('CA-1: chartsheet y hoja vacía informan que no hay celdas, sin dibujar nada', async () => {
    const { container } = show();
    const worker = await opened();
    act(() => worker.unit({ ...SHEET, rows: [], columns: 0 }));
    expect(screen.getByText('Esta hoja no tiene celdas para mostrar.')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Gráfico' }));
    act(() => worker.unit({ index: 1, columns: 0, rows: [], missingCache: 0 }));
    expect(screen.getByText('Esta hoja no tiene celdas para mostrar.')).toBeTruthy();
    expect(container.querySelector('table,canvas,svg:not([aria-hidden])')).toBeNull();
  });

  it('CA-1: fórmulas sin cache se avisan solo para la ventana visible, sin evaluar', async () => {
    show();
    const worker = await opened();
    const noCache = cell(2, 'Sin valor guardado', 'no-cache');
    act(() =>
      worker.unit({
        ...SHEET,
        rows: [
          { row: 1, cells: [cell(1, 'Total'), noCache] },
          { row: 2, cells: [noCache] },
        ],
        missingCache: 2,
        nextOffset: 200,
      }),
    );
    expect(screen.getByRole('note').textContent).toContain(
      'En estas filas, 2 celdas tienen una fórmula sin valor guardado.',
    );
    expect(screen.getByRole('note').textContent).toContain('no recalcula fórmulas');
    expect(screen.getAllByText('Sin valor guardado')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Filas siguientes' }));
    act(() => worker.unit({ ...SHEET, rows: [{ row: 201, cells: [cell(1, '5')] }] }));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('CA-1: libro sin hojas es éxito vacío; la falla del worker llega saneada y lo termina', async () => {
    const empty = show();
    await opened({ kind: 'xlsx', sheets: [] });
    expect(screen.getByRole('status').textContent).toBe(
      'Este archivo no tiene contenido para mostrar.',
    );
    expect(empty.onReady).toHaveBeenCalledTimes(1);
    empty.unmount();
    workers = [];
    const { onFailure, container } = show();
    const worker = await opened();
    act(() => worker.failure('corrupt'));
    expect(onFailure.mock.calls).toEqual([[{ reason: 'corrupt', correlationId: '' }]]);
    expect(worker.state.terminated).toBe(1);
    expect(container.innerHTML).toBe('');
  });

  it.each([
    ['A y C', [1, 3], ['A', 'C']],
    ['B y F', [2, 6], ['B', 'F']],
    ['A y XFD', [1, 16384], ['A', 'XFD']],
    ['solo XFD', [16384], ['XFD']],
  ])(
    'CA-1: columnas no contiguas (%s) conservan su letra, sin generar vacías y avisando el salto',
    async (_label, columns, letters) => {
      show();
      const worker = await opened();
      const cells = columns.map((column) => cell(column, `v${column}`));
      act(() => worker.unit({ ...SHEET, rows: [{ row: 1, cells }] }));
      expect(rowsOf(grid())[0]).toEqual(['Fila', ...letters]);
      expect(grid().querySelectorAll('td')).toHaveLength(columns.length);
      expect(
        screen.getByText(
          'Solo se muestran las columnas con datos en estas filas; cada encabezado indica su columna real.',
        ),
      ).toBeTruthy();
    },
  );

  it('CA-1: columnas contiguas desde A no muestran el aviso de columnas omitidas', async () => {
    show();
    const worker = await opened();
    act(() => worker.unit({ ...SHEET, rows: [{ row: 1, cells: [cell(1, 'a'), cell(2, 'b')] }] }));
    expect(rowsOf(grid())[0]).toEqual(['Fila', 'A', 'B']);
    expect(screen.queryByText(/Solo se muestran las columnas/)).toBeNull();
  });

  it('CA-2: filas con número repetido (archivo malformado) se pintan en orden sin claves duplicadas', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    show();
    const worker = await opened();
    const repeated = [
      { row: 5, cells: [cell(1, 'a')] },
      { row: 5, cells: [cell(1, 'b')] },
      { row: 2, cells: [cell(1, 'c')] },
    ];
    act(() => worker.unit({ ...SHEET, rows: repeated }));
    expect(rowsOf(grid()).slice(1)).toEqual([
      ['5', 'a'],
      ['5', 'b'],
      ['2', 'c'],
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('CA-7: desmontar termina el worker y descarta mensajes tardíos sin callbacks', async () => {
    const { unmount, onFailure, onReady } = show();
    const worker = await opened();
    unmount();
    expect(worker.state.terminated).toBe(1);
    expect(worker.state.options?.signal.aborted).toBe(true);
    act(() => worker.unit(SHEET));
    act(() => worker.failure('memory'));
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });
});
