import {
  INDEXING_REASONS as CONTRACT_REASONS,
  INDEXING_STATES as CONTRACT_STATES,
} from '@nimbo/contracts';

import { IndexingNotRetryableError } from './errors';
import { FAILURE_REASONS, FileIndexing, INDEXING_REASONS, INDEXING_STATES } from './file-indexing';
import type { FailureReason, FileIndexingSnapshot, UnindexableReason } from './file-indexing';

const CREATED = new Date('2026-10-21T10:00:00.000Z');
const LATER = new Date('2026-10-21T10:01:00.000Z');
const DONE = { durationMs: 4_200, now: LATER };

const pending = (): FileIndexing =>
  FileIndexing.pending({
    id: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    fileId: '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f',
    versionId: '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40',
    now: CREATED,
  });

const indexing = (): FileIndexing => pending().claim(LATER);
const failed = (): FileIndexing => indexing().fail('proveedor_no_disponible', DONE);

const finishers: readonly [string, (claimed: FileIndexing) => FileIndexing][] = [
  ['indexado', (claimed) => claimed.complete({ ...DONE, fragmentCount: 3 })],
  ['no_indexable', (claimed) => claimed.markUnindexable('sin_texto', DONE)],
];

describe('FileIndexing (plan 019 §2)', () => {
  it('CA-13: los estados y motivos del dominio son los de `@nimbo/contracts`', () => {
    expect(INDEXING_STATES).toEqual(CONTRACT_STATES);
    expect(INDEXING_REASONS).toEqual(CONTRACT_REASONS);
  });

  it('CA-9: nace `pendiente`, sin motivo, intentos, fragmentos ni duración', () => {
    const created = pending();

    expect(created.state).toBe('pendiente');
    expect(created.reason).toBeNull();
    expect(created.snapshot()).toMatchObject({
      attempts: 0,
      fragmentCount: 0,
      durationMs: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    });
  });

  it('CA-9: `pendiente → indexando` cuenta un intento; un trabajo recuperado vuelve a reclamar', () => {
    const claimed = indexing();
    const reclaimed = claimed.claim(DONE.now);

    expect(claimed.state).toBe('indexando');
    expect(claimed.snapshot().attempts).toBe(1);
    expect(reclaimed.state).toBe('indexando');
    expect(reclaimed.snapshot().attempts).toBe(2);
  });

  it('CA-9: `indexando → indexado` guarda fragmentos, duración y fecha', () => {
    const indexed = indexing().complete({ ...DONE, fragmentCount: 12 });

    expect(indexed.state).toBe('indexado');
    expect(indexed.reason).toBeNull();
    expect(indexed.snapshot()).toMatchObject({
      fragmentCount: 12,
      durationMs: 4_200,
      updatedAt: LATER,
    });
  });

  it.each<UnindexableReason>(['sin_texto', 'formato_no_soportado', 'demasiado_grande'])(
    'CA-13: `indexando → no_indexable` con motivo `%s`',
    (reason) => {
      const unindexable = indexing().markUnindexable(reason, DONE);

      expect(unindexable.state).toBe('no_indexable');
      expect(unindexable.reason).toBe(reason);
    },
  );

  it.each<FailureReason>([...FAILURE_REASONS])(
    'CA-13: `indexando → fallido` con motivo `%s`',
    (reason) => {
      const result = indexing().fail(reason, DONE);

      expect(result.state).toBe('fallido');
      expect(result.reason).toBe(reason);
      expect(result.isRetryable).toBe(true);
    },
  );

  it('CA-13: agotar los intentos antes de reclamar también deja `fallido`', () => {
    expect(pending().fail('lectura_fallida', { durationMs: null, now: LATER }).state).toBe(
      'fallido',
    );
  });

  it('CA-13: «Reintentar» lleva `fallido → pendiente` y limpia motivo, intentos y duración', () => {
    const retried = failed().retry(new Date('2026-10-21T11:00:00.000Z'));

    expect(retried.state).toBe('pendiente');
    expect(retried.reason).toBeNull();
    expect(retried.snapshot()).toMatchObject({ attempts: 0, durationMs: null });
  });

  it.each<[string, () => FileIndexing]>([
    ['pendiente', pending],
    ['indexando', indexing],
    ['indexado', () => indexing().complete({ ...DONE, fragmentCount: 1 })],
    ['no_indexable', () => indexing().markUnindexable('demasiado_grande', DONE)],
  ])('CA-13: «Reintentar» sobre `%s` es un 409 `IndexingNotRetryableError`', (_state, build) => {
    const current = build();

    expect(current.isRetryable).toBe(false);
    expect(() => current.retry(LATER)).toThrow(IndexingNotRetryableError);
  });

  it.each<[string, boolean, () => FileIndexing]>([
    ['pendiente', true, pending],
    ['indexando', true, indexing],
    ['indexado', false, () => indexing().complete({ ...DONE, fragmentCount: 1 })],
    ['no_indexable', false, () => indexing().markUnindexable('sin_texto', DONE)],
    ['fallido', false, failed],
  ])('CA-9: `%s` espera al `worker`: %s', (_state, expected, build) => {
    expect(build().isAwaitingWorker).toBe(expected);
  });

  it('CA-9: solo se termina lo que se está indexando', () => {
    expect(() => pending().complete({ ...DONE, fragmentCount: 1 })).toThrow(TypeError);
    expect(() => pending().markUnindexable('sin_texto', DONE)).toThrow(TypeError);
  });

  it.each(finishers)(
    'CA-9: `%s` es final: no se reclama, termina ni falla de nuevo',
    (_state, finish) => {
      const finished = finish(indexing());

      expect(() => finished.claim(LATER)).toThrow(TypeError);
      expect(() => finished.complete({ ...DONE, fragmentCount: 1 })).toThrow(TypeError);
      expect(() => finished.markUnindexable('sin_texto', DONE)).toThrow(TypeError);
      expect(() => finished.fail('error_interno', DONE)).toThrow(TypeError);
    },
  );

  it('CA-13: un `fallido` solo sale con «Reintentar»', () => {
    expect(() => failed().claim(LATER)).toThrow(TypeError);
    expect(() => failed().complete({ ...DONE, fragmentCount: 1 })).toThrow(TypeError);
  });

  it('CA-9: una transición devuelve otro estado y no cambia el original', () => {
    const created = pending();
    created.claim(LATER);

    expect(created.state).toBe('pendiente');
  });

  it('CA-13: rehidrata un `fallido` con su motivo; el motivo existe solo en `no_indexable` y `fallido`', () => {
    const snapshot: FileIndexingSnapshot = failed().snapshot();

    expect(FileIndexing.rehydrate(snapshot).reason).toBe('proveedor_no_disponible');
    expect(() => FileIndexing.rehydrate({ ...snapshot, reason: null })).toThrow(TypeError);
    expect(() => FileIndexing.rehydrate({ ...pending().snapshot(), reason: 'sin_texto' })).toThrow(
      TypeError,
    );
  });

  it('CA-13: el motivo corresponde al estado: `no_indexable` no lleva uno de fallo ni al revés', () => {
    const unindexable = indexing().markUnindexable('sin_texto', DONE).snapshot();

    expect(() => FileIndexing.rehydrate({ ...unindexable, reason: 'error_interno' })).toThrow(
      TypeError,
    );
    expect(() => FileIndexing.rehydrate({ ...failed().snapshot(), reason: 'sin_texto' })).toThrow(
      TypeError,
    );
  });

  it.each<[string, Partial<FileIndexingSnapshot>]>([
    ['intentos negativos', { attempts: -1 }],
    ['fragmentos no enteros', { fragmentCount: 1.5 }],
    ['duración negativa', { durationMs: -3 }],
  ])('CA-9: rechaza %s', (_case, change) => {
    expect(() => FileIndexing.rehydrate({ ...pending().snapshot(), ...change })).toThrow(TypeError);
  });
});
