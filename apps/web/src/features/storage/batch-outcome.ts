import type { BatchFailure, BatchResult, NodeSummary } from '@nimbo/contracts';

import { messageForCode } from '../../lib/error-catalog';

/** Acciones por lote que responden `BatchResult` (descargar arma su propio resultado). */
export type BatchAction = 'move' | 'trash' | 'share';

export interface BatchFailureLine {
  readonly id: string;
  readonly name: string;
  readonly message: string;
}

/** Resultado de una acción por lote para el aviso sobre la lista: éxito, parcial (con lo que falló) o error. */
export interface BatchOutcome {
  readonly tone: 'success' | 'warning' | 'error';
  readonly title: string;
  readonly failures: readonly BatchFailureLine[];
}

const count = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/** «Se movió 1 elemento» / «Se movieron 2 elementos a la papelera» / «Se compartieron 1 de 2». */
const VERBS: Readonly<Record<BatchAction, readonly [string, string, string]>> = {
  move: ['Se movió', 'Se movieron', ''],
  trash: ['Se movió', 'Se movieron', ' a la papelera'],
  share: ['Se compartió', 'Se compartieron', ''],
};

function titleOf(action: BatchAction, done: number, total: number): string {
  const [one, many, place] = VERBS[action];
  const verb = done === 1 ? one : many;
  if (done === total) return `${verb} ${count(total, 'elemento', 'elementos')}${place}.`;
  return `${verb} ${String(done)} de ${String(total)}${place}. Revisa los que no se pudieron:`;
}

/** Cada elemento que falló con su nombre y el motivo del catálogo de errores (RNF-14). */
export function failureLinesOf(
  failed: readonly BatchFailure[],
  selected: readonly NodeSummary[],
): readonly BatchFailureLine[] {
  return failed.map(({ id, code }) => {
    const name = selected.find((node) => node.id === id)?.name ?? '';
    return { id, name, message: messageForCode(code, { fileName: name }) };
  });
}

export function batchOutcomeOf(
  action: BatchAction,
  result: BatchResult,
  selected: readonly NodeSummary[],
): BatchOutcome {
  const total = result.succeeded.length + result.failed.length;
  return {
    tone: result.failed.length === 0 ? 'success' : 'warning',
    title: titleOf(action, result.succeeded.length, total),
    failures: failureLinesOf(result.failed, selected),
  };
}

/** La petición no llegó o falló entera: la selección se conserva para reintentar. */
export const BATCH_REQUEST_FAILED: BatchOutcome = {
  tone: 'error',
  title:
    'No pudimos completar la acción. Revisa tu conexión, actualiza la lista y vuelve a intentarlo.',
  failures: [],
};

/** «Empezó la descarga de 2 archivos.», con lo que no se pudo descargar. */
export function downloadOutcomeOf(
  started: number,
  failures: readonly BatchFailureLine[],
): BatchOutcome {
  return {
    tone: failures.length === 0 ? 'success' : 'warning',
    title: `Empezó la descarga de ${count(started, 'archivo', 'archivos')}.`,
    failures,
  };
}
