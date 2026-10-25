import { PdfLocation } from './pdf-location';
import type { RetrievedFragment } from './retrieved-fragment';
import { RRF_K, fuse } from './rrf-fuse';

const fragment = (id: string): RetrievedFragment => ({
  id,
  fileId: `archivo-${id}`,
  versionId: `version-${id}`,
  text: `texto ${id}`,
  location: PdfLocation.page(1),
});

const ids = (fragments: readonly RetrievedFragment[]): readonly string[] =>
  fragments.map(({ id }) => id);

describe('fuse (RRF, plan 020 D-2)', () => {
  it('CA-1: un fragmento presente en ambas búsquedas sube por encima de los que salen en una sola', () => {
    const keyword = [fragment('a'), fragment('b')];
    const vector = [fragment('c'), fragment('b')];

    expect(ids(fuse([keyword, vector]))).toEqual(['b', 'a', 'c']);
  });

  it('CA-1: cada fragmento aparece una sola vez', () => {
    const fused = fuse([
      [fragment('a'), fragment('b')],
      [fragment('b'), fragment('a')],
    ]);

    expect(ids(fused)).toEqual(['a', 'b']);
  });

  it('CA-1: el puntaje suma 1 / (k + posición) de cada búsqueda, con k constante', () => {
    const keyword = [fragment('x'), fragment('y')];
    const vector = [fragment('z'), fragment('w'), fragment('y')];

    expect(1 / (RRF_K + 2) + 1 / (RRF_K + 3)).toBeGreaterThan(1 / (RRF_K + 1));
    expect(ids(fuse([keyword, vector]))).toEqual(['y', 'x', 'z', 'w']);
  });

  it('CA-1: con puntajes iguales conserva el orden de llegada', () => {
    expect(ids(fuse([[fragment('a')], [fragment('b')]]))).toEqual(['a', 'b']);
  });

  it('CA-3: sin resultados no inventa fragmentos', () => {
    expect(fuse([[], []])).toEqual([]);
  });
});
