import {
  STORAGE_ERROR_CODES,
  type BatchFailure,
  type BatchResult,
  type NodeSummary,
} from '@nimbo/contracts';

import { messageForCode } from '../../lib/error-catalog';
import { shareCodeMessage } from '../sharing';

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

/** «1 elemento» / «2 elementos»: títulos de la barra, los diálogos y los resultados. */
export const elementCount = (n: number): string => count(n, 'elemento', 'elementos');

/** «Se movió 1 elemento» / «Se movieron 2 elementos a la papelera» / «Se compartieron 1 de 2». */
const VERBS: Readonly<Record<BatchAction, readonly [string, string, string]>> = {
  move: ['Se movió', 'Se movieron', ''],
  trash: ['Se movió', 'Se movieron', ' a la papelera'],
  share: ['Se compartió', 'Se compartieron', ''],
};

function titleOf(action: BatchAction, done: number, total: number): string {
  const [one, many, place] = VERBS[action];
  const verb = done === 1 ? one : many;
  if (done === total) return `${verb} ${elementCount(total)}${place}.`;
  return `${verb} ${String(done)} de ${String(total)}${place}. Revisa los que no se pudieron:`;
}

/**
 * En un lote, `STORAGE_NODE_NOT_FOUND` es el elemento mismo (borrado, movido o ya en la papelera), no «la carpeta de
 * destino» del texto del catálogo para subir y crear.
 */
const ITEM_MESSAGES: Readonly<Record<string, string>> = {
  [STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND]:
    'Ya no existe o está en la papelera. Actualiza la lista y vuelve a intentarlo.',
};

const itemMessageOf = (code: string, fileName: string): string =>
  ITEM_MESSAGES[code] ?? shareCodeMessage(code) ?? messageForCode(code, { fileName });

/** Cada elemento que falló con su nombre y el motivo del catálogo de errores (RNF-14). */
export function failureLinesOf(
  failed: readonly BatchFailure[],
  selected: readonly NodeSummary[],
): readonly BatchFailureLine[] {
  return failed.map(({ id, code }) => {
    const name = selected.find((node) => node.id === id)?.name ?? '';
    return { id, name, message: itemMessageOf(code, name) };
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

function downloadTitleOf(started: number, failures: number): string {
  if (started > 0) return `Empezó la descarga de ${count(started, 'archivo', 'archivos')}.`;
  return failures > 0
    ? 'No se pudo descargar ningún archivo. Revisa los que fallaron:'
    : 'No hay archivos para descargar: las carpetas seleccionadas están vacías.';
}

/** «Empezó la descarga de 2 archivos.», con lo que no se pudo descargar; sin archivos, lo dice. */
export function downloadOutcomeOf(
  started: number,
  failures: readonly BatchFailureLine[],
): BatchOutcome {
  return {
    tone: started > 0 && failures.length === 0 ? 'success' : 'warning',
    title: downloadTitleOf(started, failures.length),
    failures,
  };
}
