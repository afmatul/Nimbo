import {
  OPTIMIZATION_REASONS,
  OPTIMIZATION_STATES,
  OPTIMIZER_ERROR_CODES,
  optimizationResponseSchema,
  optimizationStatusSchema,
  runOptimizationBodySchema,
} from '..';

const ID = '7b1f6c2e-0c1a-4a9e-9a52-5d8c1e0f2a34';
const UPDATED = '2026-10-26T12:00:00.000Z';

const status = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  state: 'estimando',
  reason: null,
  originalBytes: 4_800_000,
  estimatedBytes: null,
  resultBytes: null,
  savedBytes: null,
  savedPercent: null,
  keepOriginalDays: null,
  pollAfterMs: 3000,
  updatedAt: UPDATED,
  ...overrides,
});

describe('contratos del optimizador (spec 021, plan §3 y §4)', () => {
  it('estados y motivos son los del `CHECK` de `optimizacion`', () => {
    expect(OPTIMIZATION_STATES).toEqual([
      'estimando',
      'estimada',
      'no_conviene',
      'no_disponible',
      'optimizando',
      'completada',
      'descartada',
      'fallida',
    ]);
    expect(OPTIMIZATION_REASONS).toEqual([
      'tamano',
      'pixeles',
      'animada',
      'ilegible',
      'ahorro_minimo',
      'version_cambiada',
      'archivo_eliminado',
      'integridad',
      'servicio_no_disponible',
    ]);
  });

  it('CA-3: el código de tipo no soportado', () => {
    expect(OPTIMIZER_ERROR_CODES.OPTIMIZER_UNSUPPORTED_TYPE).toBe('OPTIMIZER_UNSUPPORTED_TYPE');
  });

  it('acepta una estimación en curso con `pollAfterMs`', () => {
    expect(optimizationStatusSchema.safeParse(status()).success).toBe(true);
  });

  it('CA-5: `no_disponible` lleva un motivo de su lista y no se consulta más', () => {
    const unavailable = status({ state: 'no_disponible', reason: 'tamano', pollAfterMs: null });

    expect(optimizationStatusSchema.safeParse(unavailable).success).toBe(true);
    expect(
      optimizationStatusSchema.safeParse({ ...unavailable, reason: 'integridad' }).success,
    ).toBe(false);
  });

  it.each([
    ['un estado sin motivo con motivo', { state: 'estimando', reason: 'tamano' }],
    ['`fallida` sin motivo', { state: 'fallida', reason: null, pollAfterMs: null }],
    ['un estado final con `pollAfterMs`', { state: 'completada', pollAfterMs: 3000 }],
    ['un estado en curso sin `pollAfterMs`', { state: 'estimando', pollAfterMs: null }],
    ['`keepOriginalDays` fuera de `estimada`', { keepOriginalDays: 7 }],
    ['campos de más', { fileName: 'foto.jpg' }],
  ])('rechaza %s', (_case, overrides) => {
    expect(optimizationStatusSchema.safeParse(status(overrides)).success).toBe(false);
  });

  it('acepta `estimada` con sus bytes, ahorro y días de conservación', () => {
    const estimated = status({
      state: 'estimada',
      estimatedBytes: 2_900_000,
      savedBytes: 1_900_000,
      savedPercent: 39.6,
      keepOriginalDays: 7,
      pollAfterMs: null,
    });

    expect(optimizationStatusSchema.safeParse(estimated).success).toBe(true);
  });

  it('`GET …/optimization` responde la última optimización o `null`', () => {
    expect(optimizationResponseSchema.safeParse({ optimization: null }).success).toBe(true);
    expect(optimizationResponseSchema.safeParse({ optimization: status() }).success).toBe(true);
  });

  it('plan §4: run admite solo un optimizationId UUID', () => {
    expect(runOptimizationBodySchema.parse({ optimizationId: ID })).toEqual({ optimizationId: ID });
    for (const input of [{}, { optimizationId: 'invalido' }, { optimizationId: ID, fileId: ID }]) {
      expect(runOptimizationBodySchema.safeParse(input).success).toBe(false);
    }
  });
});
