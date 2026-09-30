/**
 * @jest-environment jsdom
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SPEED_WINDOW_MS, UploadProgress, computeUploadProgress } from './upload-progress';

const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:bg|text|border)-(?:red|blue|green|gray|slate|zinc|neutral|white|black)\b/i;

const MB = 1_000_000;

let root: Root | undefined;

async function mount(ui: ReactElement): Promise<void> {
  (globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => created.render(ui));
}

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  document.body.innerHTML = '';
});

describe('computeUploadProgress (CA-21)', () => {
  const base = {
    loadedBytes: 358 * MB,
    sizeBytes: 862 * MB,
    nowMs: 10_000,
    samples: [
      { atMs: 0, loadedBytes: 100 * MB },
      { atMs: 5_000, loadedBytes: 316 * MB },
      { atMs: 8_000, loadedBytes: 340 * MB },
    ],
  };

  it('CA-21: calcula el porcentaje truncado, los bytes legibles y la velocidad media de los últimos 5 s', () => {
    const stats = computeUploadProgress(base);

    expect(SPEED_WINDOW_MS).toBe(5_000);
    expect(stats.percent).toBe(41);
    expect(stats.loadedLabel).toBe('358 MB');
    expect(stats.totalLabel).toBe('862 MB');
    expect(stats.bytesPerSecond).toBe(8.4 * MB);
    expect(stats.speedLabel).toBe('8,4 MB/s');
    expect(stats.secondsRemaining).toBe(60);
    expect(stats.remainingLabel).toBe('quedan 60 s');
  });

  it('CA-21: sin muestras en la ventana la velocidad es 0 y no hay tiempo restante', () => {
    const stats = computeUploadProgress({ ...base, samples: [{ atMs: 0, loadedBytes: 0 }] });

    expect(stats.bytesPerSecond).toBe(0);
    expect(stats.speedLabel).toBeNull();
    expect(stats.secondsRemaining).toBeNull();
    expect(stats.remainingLabel).toBeNull();
  });

  it('CA-21: una carga que empieza de cero no da velocidad negativa', () => {
    const stats = computeUploadProgress({
      ...base,
      loadedBytes: 0,
      samples: [{ atMs: 9_000, loadedBytes: 50 * MB }],
    });

    expect(stats.bytesPerSecond).toBe(0);
    expect(stats.secondsRemaining).toBeNull();
  });

  it('CA-21: el porcentaje queda entre 0 y 100 y un tamaño 0 da 0 %', () => {
    expect(computeUploadProgress({ ...base, loadedBytes: 900 * MB }).percent).toBe(100);
    expect(
      computeUploadProgress({ ...base, loadedBytes: 0, sizeBytes: 0, samples: [] }).percent,
    ).toBe(0);
  });

  it('CA-21: el tiempo restante largo se expresa en minutos', () => {
    const stats = computeUploadProgress({
      loadedBytes: 1 * MB,
      sizeBytes: 601 * MB,
      nowMs: 1_000,
      samples: [{ atMs: 0, loadedBytes: 0 }],
    });

    expect(stats.secondsRemaining).toBe(600);
    expect(stats.remainingLabel).toBe('quedan 10 min');
  });
});

describe('UploadProgress (CA-21)', () => {
  it('CA-21: muestra porcentaje, bytes enviados y total, velocidad y tiempo restante', async () => {
    await mount(
      <UploadProgress
        label="Progreso de video.mp4"
        loadedBytes={358 * MB}
        sizeBytes={862 * MB}
        nowMs={10_000}
        samples={[{ atMs: 5_000, loadedBytes: 316 * MB }]}
      />,
    );

    const text = document.body.textContent ?? '';
    expect(text).toContain('41 %');
    expect(text).toContain('358 MB de 862 MB');
    expect(text).toContain('8,4 MB/s');
    expect(text).toContain('quedan 60 s');

    const bar = document.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-label')).toBe('Progreso de video.mp4');
    expect(bar?.getAttribute('aria-valuenow')).toBe('41');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar?.getAttribute('aria-valuetext')).toBe('41 %, 358 MB de 862 MB');
  });

  it('CA-21: sin velocidad no muestra velocidad ni tiempo restante', async () => {
    await mount(
      <UploadProgress
        label="Progreso"
        loadedBytes={10 * MB}
        sizeBytes={20 * MB}
        nowMs={0}
        samples={[]}
      />,
    );

    const text = document.body.textContent ?? '';
    expect(text).toContain('50 %');
    expect(text).not.toContain('/s');
    expect(text).not.toContain('quedan');
  });

  it('usa solo tokens de Cielo Sereno, sin colores crudos', async () => {
    await mount(
      <UploadProgress label="Progreso" loadedBytes={1} sizeBytes={2} nowMs={0} samples={[]} />,
    );

    expect(document.body.innerHTML).toContain('bg-primary');
    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
  });
});
