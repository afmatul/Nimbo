/** @jest-environment jsdom */
import { OPTIMIZER_ERROR_CODES, type OptimizationStatus } from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SpaceProvider } from '../../storage/components/space-provider';
import { StorageRequestError } from '../../storage/storage-request-error';
import { spaceSummaryWith } from '../../storage/test-space-summary';
import { versionFixture } from '../../storage/test-versions';
import type { OptimizerApi } from '../optimizer-api';
import { OPTIMIZATION_MESSAGES as COPY, optimizationResultMessage } from '../optimizer-messages';
import {
  COMPLETED,
  ESTIMATING,
  fakeOptimizerApi,
  IMAGE_FILE_ID,
  optimizationStatus,
  OPTIMIZING,
} from '../test-optimization';

import { ConfirmOptimizationDialog } from './confirm-optimization-dialog';
import { OptimizationCard } from './optimization-card';

const HISTORY = {
  status: 'ready' as const,
  file: { name: 'Foto_inventario.jpg', kind: 'imagen' as const, folderId: null },
  items: [
    versionFixture({ number: 3, isCurrent: true }),
    versionFixture({ number: 2 }),
    versionFixture({ number: 1 }),
  ],
  retainedVersions: 3,
  loadedAt: Date.parse('2026-10-27T16:00:00.000Z'),
};

async function renderCard(
  api: OptimizerApi,
  readOnly = false,
  onCompleted = jest.fn(),
): Promise<void> {
  render(
    <SpaceProvider
      api={{ spaceSummary: () => Promise.resolve({ ...spaceSummaryWith(4_800_000), readOnly }) }}
      uploadedCount={0}
    >
      <OptimizationCard
        api={api}
        fileId={IMAGE_FILE_ID}
        history={HISTORY}
        onCompleted={onCompleted}
      />
    </SpaceProvider>,
  );
  await act(async () => undefined);
}

const FINAL_VARIANTS = [
  COMPLETED,
  optimizationStatus({ state: 'descartada', reason: 'ahorro_minimo', keepOriginalDays: null }),
  optimizationStatus({ state: 'descartada', reason: 'version_cambiada', keepOriginalDays: null }),
  optimizationStatus({ state: 'descartada', reason: 'archivo_eliminado', keepOriginalDays: null }),
  optimizationStatus({ state: 'fallida', reason: 'integridad', keepOriginalDays: null }),
  optimizationStatus({
    state: 'fallida',
    reason: 'servicio_no_disponible',
    keepOriginalDays: null,
  }),
];
const STATES: readonly (OptimizationStatus | null)[] = [
  null,
  ESTIMATING,
  optimizationStatus(),
  optimizationStatus({ state: 'no_conviene', keepOriginalDays: null }),
  optimizationStatus({ state: 'no_disponible', reason: 'tamano', keepOriginalDays: null }),
  OPTIMIZING,
  ...FINAL_VARIANTS,
];

describe('OptimizationCard: ocho estados visuales (021 §6)', () => {
  beforeEach(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }),
  );
  afterEach(() => jest.useRealTimers());

  it('CA-1: sin estimación calcula, nunca ejecuta directamente y protege doble clic', async () => {
    let resolve!: (status: OptimizationStatus) => void;
    const api = fakeOptimizerApi({
      estimate: jest.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    });
    await renderCard(api);
    expect(screen.getByText(COPY.idle)).toBeTruthy();
    const calculate = screen.getByRole('button', { name: 'Calcular ahorro' });
    fireEvent.click(calculate);
    fireEvent.click(calculate);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    expect(api.estimate).toHaveBeenCalledWith(IMAGE_FILE_ID);
    expect(screen.getByText(COPY.estimating)).toBeTruthy();
    expect(api.run).not.toHaveBeenCalled();
    await act(async () => resolve(ESTIMATING));
  });

  it.each([ESTIMATING, OPTIMIZING])(
    'CA-6: $state tiene texto y progreso indeterminado (sin porcentaje) y no ejecuta',
    async (status) => {
      await renderCard(fakeOptimizerApi({ status: jest.fn().mockResolvedValue(status) }));
      const label = status.state === 'estimando' ? COPY.estimating : COPY.optimizing;
      expect(within(screen.getByRole('status')).getByText(label)).toBeTruthy();
      const progress = screen.getByRole('progressbar', { name: label });
      expect(progress.getAttribute('aria-valuenow')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Optimizar' })).toBeNull();
    },
  );

  it('RNF-14: el botón pulsado queda como «Calculando…» enfocable y, al llegar el resultado, el foco pasa al cuerpo', async () => {
    let resolve!: (status: OptimizationStatus) => void;
    const api = fakeOptimizerApi({
      estimate: jest.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    });
    await renderCard(api);
    await userEvent.click(screen.getByRole('button', { name: 'Calcular ahorro' }));
    const busy = screen.getByRole('button', { name: 'Calculando…' });
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(busy);
    await userEvent.click(busy);
    expect(api.estimate).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve(optimizationStatus({ state: 'no_conviene', keepOriginalDays: null })),
    );
    expect(screen.queryByRole('button', { name: 'Calculando…' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('CA-1, CA-13: conviene abre confirmar con tamaño, ahorro, conservación, poda y foco en cancelar', async () => {
    const api = fakeOptimizerApi({ status: jest.fn().mockResolvedValue(optimizationStatus()) });
    await renderCard(api);
    expect(screen.getByText('Tamaño actual')).toBeTruthy();
    expect(screen.getByText('Tamaño estimado')).toBeTruthy();
    // Coma decimal en bytes y en porcentaje, como `formatBytes` (no «39.5 %»).
    expect(screen.getByText('Ahorrarías 1,9 MB (39,5 %)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Optimizar' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Optimizar esta imagen?' });
    expect(dialog.textContent).toContain('4,8 MB · versión 3');
    expect(dialog.textContent).toContain('El original se conserva hasta el');
    expect(dialog.textContent).toContain('no ocupa tu espacio');
    expect(dialog.textContent).not.toContain(HISTORY.file.name);
    expect(dialog.textContent).toContain('Al continuar se eliminará la versión 1, la más antigua.');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(api.run).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Optimizar' }));
  });

  it('CA-6, CA-12: confirmar llama run una vez, deshabilita durante envío y cierra tras 202', async () => {
    let resolve!: (status: OptimizationStatus) => void;
    const api = fakeOptimizerApi({
      status: jest.fn().mockResolvedValue(optimizationStatus()),
      run: jest.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    });
    await renderCard(api);
    await userEvent.click(screen.getByRole('button', { name: 'Optimizar' }));
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Optimizar',
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.run).toHaveBeenCalledTimes(1);
    expect(api.run).toHaveBeenCalledWith(IMAGE_FILE_ID, { optimizationId: OPTIMIZING.id });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await act(async () => resolve(OPTIMIZING));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(screen.getByRole('status')).getByText(COPY.optimizing)).toBeTruthy();
    // Radix devuelve el foco al cerrar en el siguiente ciclo (`onCloseAutoFocus`).
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Optimizando…' })),
    );
  });

  it('CA-13: sin poda no hay aviso y el foco inicial va a «Optimizar» (como restaurar, 014)', () => {
    render(
      <ConfirmOptimizationDialog
        status={optimizationStatus()}
        currentNumber={2}
        versions={HISTORY.items.slice(0, 2)}
        retainedVersions={3}
        pending={false}
        readOnly={false}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
        onReturnFocus={jest.fn()}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: '¿Optimizar esta imagen?' });
    expect(dialog.textContent).not.toContain('Se eliminará');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Optimizar' }));
  });

  it('CA-2: no conviene explica y no permite forzar ni recalcular la misma versión', async () => {
    await renderCard(
      fakeOptimizerApi({
        status: jest
          .fn()
          .mockResolvedValue(optimizationStatus({ state: 'no_conviene', keepOriginalDays: null })),
      }),
    );
    expect(screen.getByText(COPY.notWorthIt)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Optimizar|Calcular ahorro/ })).toBeNull();
  });

  it.each(['tamano', 'pixeles', 'animada', 'ilegible'] as const)(
    'CA-5: %s usa el mismo único mensaje',
    async (reason) => {
      await renderCard(
        fakeOptimizerApi({
          status: jest
            .fn()
            .mockResolvedValue(
              optimizationStatus({ state: 'no_disponible', reason, keepOriginalDays: null }),
            ),
        }),
      );
      expect(screen.getByText(COPY.unavailable)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Optimizar' })).toBeNull();
    },
  );

  it.each(FINAL_VARIANTS)('CA-7, CA-9 a CA-11, CA-14: final $state / $reason', async (status) => {
    await renderCard(fakeOptimizerApi({ status: jest.fn().mockResolvedValue(status) }));
    expect(screen.getByText(optimizationResultMessage(status))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Optimizar' })).toBeNull();
    const canCalculate =
      status.reason === 'servicio_no_disponible' || status.reason === 'version_cambiada';
    expect(screen.queryByRole('button', { name: 'Calcular ahorro' }) !== null).toBe(canCalculate);
  });

  it('CA-11: 409 stale cierra confirmación, relee, olvida estimación y permite recalcular sin reejecutar', async () => {
    const stale = new StorageRequestError(409, OPTIMIZER_ERROR_CODES.OPTIMIZER_ESTIMATE_STALE);
    const api = fakeOptimizerApi({
      status: jest.fn().mockResolvedValue(optimizationStatus()),
      run: jest.fn().mockRejectedValue(stale),
    });
    await renderCard(api);
    await userEvent.click(screen.getByRole('button', { name: 'Optimizar' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Optimizar' }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(COPY.stale)).toBeTruthy();
    expect(screen.queryByText(/Ahorrarías/)).toBeNull();
    expect(api.status).toHaveBeenCalledTimes(2);
    expect(api.run).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Calcular ahorro' }));
    expect(api.estimate).toHaveBeenCalledTimes(1);
    expect(api.run).toHaveBeenCalledTimes(1);
  });

  it('CA-17: solo lectura permite estimar pero deshabilita Optimizar y nunca llama run', async () => {
    const api = fakeOptimizerApi({ estimate: jest.fn().mockResolvedValue(optimizationStatus()) });
    await renderCard(api, true);
    await userEvent.click(screen.getByRole('button', { name: 'Calcular ahorro' }));
    const optimize = screen.getByRole('button', { name: 'Optimizar' });
    expect((optimize as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(optimize);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.run).not.toHaveBeenCalled();
  });

  it('CA-3: unsupported reutiliza no disponible sin estados por formato', async () => {
    const api = fakeOptimizerApi({
      estimate: jest
        .fn()
        .mockRejectedValue(
          new StorageRequestError(422, OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE),
        ),
    });
    await renderCard(api);
    await userEvent.click(screen.getByRole('button', { name: 'Calcular ahorro' }));
    expect(screen.getByText(COPY.unavailable)).toBeTruthy();
  });

  it.each([
    ['oculta', new StorageRequestError(404, 'STORAGE_NODE_NOT_FOUND')],
    [
      '«no disponible»',
      new StorageRequestError(422, OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE),
    ],
  ] as const)('una revalidación válida recupera la tarjeta %s', async (_, failure) => {
    const api = fakeOptimizerApi({
      status: jest.fn().mockRejectedValueOnce(failure).mockResolvedValue(null),
    });
    await renderCard(api);
    expect(screen.queryByRole('button', { name: 'Calcular ahorro' })).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByRole('button', { name: 'Calcular ahorro' })).toBeTruthy();
    expect(screen.queryByText(COPY.unavailable)).toBeNull();
  });

  describe.each([360, 1440])('CA-22: RTL + axe a %i px', (width) => {
    beforeEach(() =>
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }),
    );
    it.each(STATES)('tarjeta y estado $state / $reason sin violaciones', async (status) => {
      await renderCard(fakeOptimizerApi({ status: jest.fn().mockResolvedValue(status) }));
      expect((await axe(document.body)).violations).toEqual([]);
    });
    it('confirmar y solo lectura sin violaciones', async () => {
      await renderCard(
        fakeOptimizerApi({ status: jest.fn().mockResolvedValue(optimizationStatus()) }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Optimizar' }));
      expect((await axe(document.body)).violations).toEqual([]);
    });
    it('Optimizar deshabilitado sin violaciones', async () => {
      await renderCard(
        fakeOptimizerApi({ status: jest.fn().mockResolvedValue(optimizationStatus()) }),
        true,
      );
      expect((await axe(document.body)).violations).toEqual([]);
    });
  });
});
