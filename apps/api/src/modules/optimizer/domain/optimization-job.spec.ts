import { OptimizationJob } from './optimization-job';
import type { OptimizationJobSnapshot, OptimizationReason } from './optimization-job';

const THRESHOLD = { minBytes: 1_000_000n, minPercent: 20 };

const NOW = new Date('2026-10-26T12:00:00.000Z');
const LATER = new Date('2026-10-26T12:20:00.000Z');
const WINDOW_MS = 15 * 60 * 1000;
const SOURCE = '4b3f0c9a-5d1e-4c7b-9a12-3e8f6d2c1b00';

const base = {
  id: '9a0c3b7e-1f2d-4e5a-8b6c-7d8e9f0a1b2c',
  fileId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  sourceVersionId: SOURCE,
  originalBytes: 4_800_000n,
  now: NOW,
};

const snapshotOf = (overrides: Partial<OptimizationJobSnapshot>): OptimizationJobSnapshot => ({
  ...OptimizationJob.startEstimate(base).snapshot(),
  ...(['optimizando', 'completada', 'descartada'].includes(overrides.state ?? '')
    ? {
        resultVersionId: '6f25cbd0-aedc-4271-a69f-3ce13de2d138',
        estimatedBytes: 3_000_000n,
        ...(overrides.state === 'completada' ? { resultBytes: 2_900_000n } : {}),
      }
    : {}),
  ...overrides,
});

describe('OptimizationJob (plan 021 §3)', () => {
  it('pedir el cálculo crea la optimización en `estimando`, en curso y sin motivo ni bytes de resultado', () => {
    const job = OptimizationJob.startEstimate(base);

    expect(job.snapshot()).toEqual({
      id: base.id,
      fileId: base.fileId,
      sourceVersionId: SOURCE,
      resultVersionId: null,
      state: 'estimando',
      reason: null,
      originalBytes: 4_800_000n,
      estimatedBytes: null,
      resultBytes: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(job.isInProgress).toBe(true);
  });

  it('CA-5: por encima del tope de bytes nace ya final en `no_disponible(tamano)`', () => {
    const job = OptimizationJob.unavailableBySize(base);

    expect(job.state).toBe('no_disponible');
    expect(job.reason).toBe('tamano');
    expect(job.isInProgress).toBe(false);
  });

  it.each([
    ['un estado sin motivo con motivo', { state: 'estimando', reason: 'tamano' }],
    ['`fallida` sin motivo', { state: 'fallida', reason: null }],
    ['un motivo de otro estado', { state: 'no_disponible', reason: 'integridad' }],
    ['bytes de origen no positivos', { originalBytes: 0n }],
  ] as const)('rechaza %s (mismas reglas que los `CHECK`)', (_case, overrides) => {
    expect(() => OptimizationJob.rehydrate(snapshotOf(overrides))).toThrow(TypeError);
  });

  it('caducidad perezosa: una en curso más vieja que la ventana caduca; dentro de la ventana, no', () => {
    const job = OptimizationJob.startEstimate(base);

    expect(job.isStale(new Date(NOW.getTime() + WINDOW_MS), WINDOW_MS)).toBe(false);
    expect(job.isStale(LATER, WINDOW_MS)).toBe(true);
  });

  it('fallar (caducidad o intentos agotados) la deja `fallida(servicio_no_disponible)` con esa fecha', () => {
    const expired = OptimizationJob.startEstimate(base).fail(LATER);

    expect(expired.state).toBe('fallida');
    expect(expired.reason).toBe('servicio_no_disponible');
    expect(expired.snapshot().updatedAt).toEqual(LATER);
  });

  it.each(['no_disponible', 'estimada', 'no_conviene', 'completada', 'fallida'] as const)(
    'una optimización `%s` no caduca ni se reabre',
    (state) => {
      const reasons: Partial<Record<string, OptimizationReason>> = {
        no_disponible: 'tamano',
        fallida: 'integridad',
      };
      const reason = reasons[state] ?? null;
      const job = OptimizationJob.rehydrate(
        snapshotOf({
          state,
          reason,
          ...(state === 'estimada' ? { estimatedBytes: 3_000_000n } : {}),
        }),
      );

      expect(job.isStale(LATER, WINDOW_MS)).toBe(false);
      expect(() => job.fail(LATER)).toThrow(TypeError);
    },
  );

  it('es la estimación vigente solo con un resultado de estimación sobre la versión actual', () => {
    const estimated = OptimizationJob.rehydrate(
      snapshotOf({ state: 'estimada', estimatedBytes: 1n }),
    );

    expect(estimated.isEstimateOf(SOURCE)).toBe(true);
    expect(estimated.isEstimateOf('otra-version')).toBe(false);
    expect(OptimizationJob.unavailableBySize(base).isEstimateOf(SOURCE)).toBe(true);
    expect(OptimizationJob.startEstimate(base).isEstimateOf(SOURCE)).toBe(false);
  });

  it('una estimación resuelta de otra versión es obsoleta; una en curso o final de ejecución, no', () => {
    const estimated = OptimizationJob.rehydrate(
      snapshotOf({ state: 'estimada', estimatedBytes: 1n }),
    );
    const completed = OptimizationJob.rehydrate(snapshotOf({ state: 'completada' }));

    expect(estimated.isObsoleteFor('otra-version')).toBe(true);
    expect(estimated.isObsoleteFor(SOURCE)).toBe(false);
    expect(OptimizationJob.startEstimate(base).isObsoleteFor('otra-version')).toBe(false);
    expect(completed.isObsoleteFor('otra-version')).toBe(false);
  });

  it('reclamarla (T-03) renueva `actualizado_en` sin cambiar el estado, para que no caduque mientras trabaja', () => {
    const claimed = OptimizationJob.startEstimate(base).claim(LATER);

    expect(claimed.state).toBe('estimando');
    expect(claimed.snapshot().updatedAt).toEqual(LATER);
    expect(claimed.isStale(LATER, WINDOW_MS)).toBe(false);
  });

  it('CA-1: una estimación que alcanza el umbral queda `estimada` con los bytes estimados y sin motivo', () => {
    const estimated = OptimizationJob.startEstimate(base).estimated(3_000_000n, THRESHOLD, LATER);

    expect(estimated.snapshot()).toMatchObject({
      state: 'estimada',
      reason: null,
      estimatedBytes: 3_000_000n,
      updatedAt: LATER,
    });
    expect(estimated.isInProgress).toBe(false);
  });

  it.each([
    ['no alcanza el umbral', 4_000_000n],
    ['no es menor que el original', 5_000_000n],
  ])(
    'CA-2: una estimación que %s queda `no_conviene` con sus bytes y sin motivo',
    (_case, bytes) => {
      const estimated = OptimizationJob.startEstimate(base).estimated(bytes, THRESHOLD, LATER);

      expect(estimated.state).toBe('no_conviene');
      expect(estimated.reason).toBeNull();
      expect(estimated.snapshot().estimatedBytes).toBe(bytes);
    },
  );

  it.each(['pixeles', 'animada', 'ilegible'] as const)(
    'CA-5: lo que el `worker` no puede calcular queda `no_disponible(%s)`',
    (reason) => {
      const unavailable = OptimizationJob.startEstimate(base).unavailable(reason, LATER);

      expect(unavailable.state).toBe('no_disponible');
      expect(unavailable.reason).toBe(reason);
      expect(unavailable.snapshot().estimatedBytes).toBeNull();
    },
  );

  it.each([
    ['ya resuelta', { state: 'estimada', estimatedBytes: 1n }],
    ['optimizándose', { state: 'optimizando' }],
  ] as const)(
    'solo una `estimando` recibe el resultado de la estimación (no una %s)',
    (_c, over) => {
      const job = OptimizationJob.rehydrate(snapshotOf(over));

      expect(() => job.estimated(1n, THRESHOLD, LATER)).toThrow(TypeError);
      expect(() => job.unavailable('ilegible', LATER)).toThrow(TypeError);
    },
  );

  it('solo se reclama una en curso', () => {
    const done = OptimizationJob.rehydrate(
      snapshotOf({ state: 'no_conviene', estimatedBytes: 1n }),
    );

    expect(() => done.claim(LATER)).toThrow(TypeError);
  });

  describe('ejecución (021 T-04)', () => {
    const versionId = '6f25cbd0-aedc-4271-a69f-3ce13de2d138';
    const estimated = () =>
      OptimizationJob.startEstimate(base).estimated(3_000_000n, THRESHOLD, NOW);
    const running = () => estimated().beginRun(versionId, LATER);

    it('CA-6: comenzar fija la versión de resultado una sola vez y conserva origen y estimación', () => {
      expect(running().snapshot()).toMatchObject({
        state: 'optimizando',
        resultVersionId: versionId,
        sourceVersionId: SOURCE,
        estimatedBytes: 3_000_000n,
        resultBytes: null,
      });
      expect(() => running().beginRun('otra', LATER)).toThrow(TypeError);
    });

    it('solo una estimada puede comenzar y solo una optimizando se puede completar o descartar', () => {
      expect(() => OptimizationJob.startEstimate(base).beginRun(versionId, LATER)).toThrow(
        TypeError,
      );
      expect(() => estimated().complete(2_900_000n, LATER)).toThrow(TypeError);
      expect(() => estimated().discard('ahorro_minimo', LATER)).toThrow(TypeError);
    });

    it('CA-7: completa con los bytes reales y el id preasignado', () => {
      expect(running().complete(2_900_000n, LATER).snapshot()).toMatchObject({
        state: 'completada',
        reason: null,
        resultVersionId: versionId,
        resultBytes: 2_900_000n,
      });
    });

    it.each(['ahorro_minimo', 'version_cambiada', 'archivo_eliminado'] as const)(
      'descarta por %s sin cambiar la versión preasignada',
      (reason) => {
        expect(running().discard(reason, LATER).snapshot()).toMatchObject({
          state: 'descartada',
          reason,
          resultVersionId: versionId,
          resultBytes: null,
        });
      },
    );

    it.each(['integridad', 'servicio_no_disponible'] as const)('falla por %s', (reason) => {
      expect(running().fail(LATER, reason).snapshot()).toMatchObject({ state: 'fallida', reason });
    });

    it.each(['completada', 'descartada', 'fallida'] as const)('no reabre una %s', (state) => {
      const job = running();
      const terminal =
        state === 'completada'
          ? job.complete(2_900_000n, LATER)
          : state === 'descartada'
            ? job.discard('version_cambiada', LATER)
            : job.fail(LATER);
      expect(() => terminal.beginRun(versionId, LATER)).toThrow(TypeError);
      expect(() => terminal.complete(2_900_000n, LATER)).toThrow(TypeError);
      expect(() => terminal.discard('archivo_eliminado', LATER)).toThrow(TypeError);
      expect(() => terminal.fail(LATER)).toThrow(TypeError);
    });

    it.each([
      { state: 'optimizando', resultVersionId: null },
      { state: 'estimada', resultVersionId: versionId },
      { state: 'completada', resultBytes: null },
      { state: 'completada', resultBytes: base.originalBytes },
      { state: 'optimizando', resultBytes: 2_900_000n },
      { state: 'optimizando', estimatedBytes: null },
    ] as const)('rechaza una combinación de resultado inválida al rehidratar: %p', (changes) => {
      expect(() => OptimizationJob.rehydrate({ ...running().snapshot(), ...changes })).toThrow(
        TypeError,
      );
    });
  });
});
