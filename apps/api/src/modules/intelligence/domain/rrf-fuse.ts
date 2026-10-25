import type { RetrievedFragment } from './retrieved-fragment';

/** Constante de Reciprocal Rank Fusion: amortigua el peso de las primeras posiciones (valor usual de la técnica). */
export const RRF_K = 60;

/**
 * Une las búsquedas léxica y vectorial (plan 020 D-2) por RRF: cada fragmento suma `1 / (RRF_K + posición)` de cada
 * lista en la que aparece (posición desde 1) y sale una sola vez, de mayor a menor puntaje; los empates conservan el
 * orden de llegada. No corta: el tope (`TOP_K`) lo aplica quien recupera.
 */
export function fuse(rankings: readonly (readonly RetrievedFragment[])[]): RetrievedFragment[] {
  const scored = new Map<string, { fragment: RetrievedFragment; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((fragment, index) => {
      const previous = scored.get(fragment.id);
      const score = (previous?.score ?? 0) + 1 / (RRF_K + index + 1);
      scored.set(fragment.id, { fragment: previous?.fragment ?? fragment, score });
    });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).map(({ fragment }) => fragment);
}
