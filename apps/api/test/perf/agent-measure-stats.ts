/**
 * Cálculos de `agent:measure` (020 T-09): p95 del primer fragmento (CA-2), similitud mínima propuesta (CA-3, S-6) y
 * plazos del modelo propuestos (D-7). Puros: la corrida real solo les pasa números.
 */

/** RNF-03 / CA-2: el primer fragmento de texto llega en menos de 3 s (p95). */
export const FIRST_FRAGMENT_BUDGET_MS = 3000;

/** Percentil que exige CA-2. */
export const P95 = 0.95;

/** Margen de un plazo sobre el p95 observado: cortar antes sería convertir lentitud normal en `AGENT_UNAVAILABLE`. */
const TIMEOUT_SAFETY_FACTOR = 2;
const TIMEOUT_ROUNDING_MS = 1000;
const SIMILARITY_DECIMALS = 100;

/** Percentil por rango más cercano (con 20 muestras, el p95 es la 19.ª ordenada); sin muestras, `undefined`. */
export function percentile(samples: readonly number[], rank: number): number | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(rank * sorted.length) - 1];
}

/** CA-2: se midieron todas las preguntas pedidas y su p95 queda bajo el presupuesto. */
export function meetsFirstFragmentBudget(samples: readonly number[], required: number): boolean {
  const p95 = percentile(samples, P95);
  return samples.length === required && p95 !== undefined && p95 < FIRST_FRAGMENT_BUDGET_MS;
}

/** Mejor similitud coseno de cada pregunta contra el corpus, separada por si el corpus la responde o no. */
export interface SimilaritySamples {
  readonly answerable: readonly number[];
  readonly unanswerable: readonly number[];
}

/** Umbral propuesto solo si las dos series no se cruzan; si se cruzan, quedan los extremos para la revisión. */
export type SimilarityProposal =
  | {
      readonly separated: true;
      readonly value: number;
      readonly answerableMin: number;
      readonly unanswerableMax: number;
    }
  | {
      readonly separated: false;
      readonly answerableMin: number | undefined;
      readonly unanswerableMax: number | undefined;
    };

const minOf = (values: readonly number[]): number | undefined =>
  values.length === 0 ? undefined : Math.min(...values);

const maxOf = (values: readonly number[]): number | undefined =>
  values.length === 0 ? undefined : Math.max(...values);

/**
 * CA-3: el punto medio entre la peor pregunta con respuesta y la mejor sin respuesta, a dos decimales. Si no separan,
 * no se inventa un valor (plan 020 §7, riesgo 1): se decide en la revisión de T-10.
 */
export function proposeMinSimilarity(samples: SimilaritySamples): SimilarityProposal {
  const answerableMin = minOf(samples.answerable);
  const unanswerableMax = maxOf(samples.unanswerable);
  if (
    answerableMin === undefined ||
    unanswerableMax === undefined ||
    answerableMin <= unanswerableMax
  ) {
    return { separated: false, answerableMin, unanswerableMax };
  }
  const midpoint = (answerableMin + unanswerableMax) / 2;
  const value = Math.round(midpoint * SIMILARITY_DECIMALS) / SIMILARITY_DECIMALS;
  return { separated: true, value, answerableMin, unanswerableMax };
}

/** Plazo propuesto: el doble del p95, redondeado hacia arriba al segundo; sin muestras, `undefined`. */
export function proposeTimeoutMs(samples: readonly number[]): number | undefined {
  const p95 = percentile(samples, P95);
  if (p95 === undefined) return undefined;
  return Math.ceil((p95 * TIMEOUT_SAFETY_FACTOR) / TIMEOUT_ROUNDING_MS) * TIMEOUT_ROUNDING_MS;
}
