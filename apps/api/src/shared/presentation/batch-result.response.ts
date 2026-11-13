import type { Settlement } from '../application/batch/settle-each';

/** Un elemento de un lote por tipo e id (la forma de `BatchItem` de los contratos, sin importarlos: ADR-0020). */
interface BatchTarget {
  readonly type: 'file' | 'folder';
  readonly id: string;
}

interface BatchTargetFailure extends BatchTarget {
  readonly code: string;
}

/** Los fallos de un lote como los responde la API (`BatchResult.failed`): cada uno con su tipo, id y código. */
export const toBatchFailures = (failed: Settlement<BatchTarget>['failed']): BatchTargetFailure[] =>
  failed.map(({ item, code }) => ({ type: item.type, id: item.id, code }));

/** `BatchResult` de los lotes del explorador (mover, papelera, compartir). */
export const toBatchResult = ({
  succeeded,
  failed,
}: Settlement<BatchTarget>): { succeeded: BatchTarget[]; failed: BatchTargetFailure[] } => ({
  succeeded: succeeded.map(({ type, id }) => ({ type, id })),
  failed: toBatchFailures(failed),
});
