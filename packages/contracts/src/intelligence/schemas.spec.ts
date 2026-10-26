import {
  INDEXING_EVENTS,
  INDEXING_REASONS,
  INDEXING_STATES,
  INTELLIGENCE_ERROR_CODES,
  indexingRetryResponseSchema,
  indexingStatusChangedSchema,
  indexingStatusResponseSchema,
} from './index';

const FILE_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-10-21T15:04:05.000Z';

const INDEXED = { state: 'indexado', reason: null, updatedAt: AT, canRetry: false };
const FAILED = {
  state: 'fallido',
  reason: 'proveedor_no_disponible',
  updatedAt: AT,
  canRetry: true,
};

describe('contratos de `intelligence` (plan 019 §4)', () => {
  it('CA-13: los estados de indexación son los de la spec, en orden de avance', () => {
    expect(INDEXING_STATES).toEqual([
      'pendiente',
      'indexando',
      'indexado',
      'no_indexable',
      'fallido',
    ]);
  });

  it('CA-4, CA-5, CA-7, CA-12: los motivos son los del `CHECK` de `indexacion.motivo`', () => {
    expect([...INDEXING_REASONS].sort()).toEqual(
      [
        'demasiado_grande',
        'error_interno',
        'formato_no_soportado',
        'lectura_fallida',
        'proveedor_no_disponible',
        'sin_texto',
      ].sort(),
    );
  });

  it('CA-13: el único código propio es reintentar fuera de `fallido`', () => {
    expect(INTELLIGENCE_ERROR_CODES).toEqual({
      INTELLIGENCE_INDEXING_NOT_RETRYABLE: 'INTELLIGENCE_INDEXING_NOT_RETRYABLE',
    });
  });

  it('CA-14: el estado trae `state`, `reason`, `updatedAt` y `canRetry`', () => {
    expect(indexingStatusResponseSchema.parse(INDEXED)).toEqual(INDEXED);
    expect(indexingStatusResponseSchema.parse(FAILED)).toEqual(FAILED);
  });

  it('CA-6: un tipo que no se indexa responde `state: null`, sin motivo, fecha ni reintento', () => {
    const none = { state: null, reason: null, updatedAt: null, canRetry: false };

    expect(indexingStatusResponseSchema.parse(none)).toEqual(none);
    expect(indexingStatusResponseSchema.safeParse({ ...none, canRetry: true }).success).toBe(false);
    expect(indexingStatusResponseSchema.safeParse({ ...none, updatedAt: AT }).success).toBe(false);
  });

  it('plan §4: indexable y sin fila todavía es `pendiente` sin fecha', () => {
    const pending = { state: 'pendiente', reason: null, updatedAt: null, canRetry: false };

    expect(indexingStatusResponseSchema.parse(pending)).toEqual(pending);
  });

  it.each(['no_indexable', 'fallido'])('CA-14: `%s` exige motivo', (state) => {
    expect(
      indexingStatusResponseSchema.safeParse({ ...INDEXED, state, reason: null }).success,
    ).toBe(false);
  });

  it.each(['pendiente', 'indexando', 'indexado'])('CA-14: `%s` no lleva motivo', (state) => {
    expect(
      indexingStatusResponseSchema.safeParse({ ...INDEXED, state, reason: 'sin_texto' }).success,
    ).toBe(false);
  });

  it('CA-13: solo un archivo `fallido` puede ofrecer «Reintentar»', () => {
    expect(indexingStatusResponseSchema.safeParse({ ...INDEXED, canRetry: true }).success).toBe(
      false,
    );
  });

  it.each([
    ['estado desconocido', { ...INDEXED, state: 'listo' }],
    ['motivo desconocido', { ...FAILED, reason: 'cansado' }],
    ['fecha inválida', { ...INDEXED, updatedAt: 'ayer' }],
    ['nombre del archivo', { ...INDEXED, fileName: 'informe.docx' }],
    ['cantidad de fragmentos', { ...INDEXED, fragmentCount: 12 }],
  ])('CA-20, CA-21: rechaza un estado con %s', (_case, response) => {
    expect(indexingStatusResponseSchema.safeParse(response).success).toBe(false);
  });

  it('CA-13: «Reintentar» responde `pendiente` y nada más', () => {
    expect(indexingRetryResponseSchema.parse({ state: 'pendiente' })).toEqual({
      state: 'pendiente',
    });
    expect(indexingRetryResponseSchema.safeParse({ state: 'indexando' }).success).toBe(false);
    expect(
      indexingRetryResponseSchema.safeParse({ state: 'pendiente', fileId: FILE_ID }).success,
    ).toBe(false);
  });

  it('CA-14: `indexing.status-changed` lleva archivo, estado y motivo, sin nombre, texto ni versión', () => {
    const changed = { fileId: FILE_ID, state: 'no_indexable', reason: 'sin_texto' };

    expect(INDEXING_EVENTS).toEqual({ STATUS_CHANGED: 'indexing.status-changed' });
    expect(indexingStatusChangedSchema.parse(changed)).toEqual(changed);
    expect(indexingStatusChangedSchema.safeParse({ ...changed, reason: null }).success).toBe(false);
    expect(
      indexingStatusChangedSchema.safeParse({ ...changed, fileName: 'informe.pdf' }).success,
    ).toBe(false);
    expect(indexingStatusChangedSchema.safeParse({ ...changed, versionId: FILE_ID }).success).toBe(
      false,
    );
    expect(
      indexingStatusChangedSchema.safeParse({ ...changed, state: null, reason: null }).success,
    ).toBe(false);
  });
});
