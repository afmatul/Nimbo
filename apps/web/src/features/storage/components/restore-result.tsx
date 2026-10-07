import { STORAGE_ERROR_CODES, type RestoreResponse, type TrashItem } from '@nimbo/contracts';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { MY_FILES_LABEL } from '../routes';
import { StorageRequestError } from '../storage-request-error';

/** Resultado de restaurar un elemento: en su lugar, con cambios («(n)» o a la raíz) o no restaurado. */
export interface RestoreLine {
  readonly id: string;
  readonly status: 'restored' | 'changed' | 'failed';
  readonly text: string;
}

/** Nombre de la ubicación original, «Mis archivos» si estaba en la raíz. */
export function originalPlaceName(item: TrashItem): string {
  return item.originalFolder?.name ?? MY_FILES_LABEL;
}

/** Texto de cada `outcome` (CA-13, CA-14, CA-15). */
export function restoreSuccessLine(item: TrashItem, response: RestoreResponse): RestoreLine {
  const { outcome, originalName } = response;
  if (outcome === 'renamed') {
    return {
      id: item.id,
      status: 'changed',
      text: `Restauramos «${originalName}» como «${response.item.name}» porque ya existía uno con ese nombre.`,
    };
  }
  if (outcome === 'moved_to_root') {
    const asName =
      response.item.name === originalName
        ? ''
        : ` como «${response.item.name}» porque ya existía uno con ese nombre`;
    return {
      id: item.id,
      status: 'changed',
      text: `La carpeta original ya no está disponible. Restauramos «${originalName}» en ${MY_FILES_LABEL}${asName}.`,
    };
  }
  return {
    id: item.id,
    status: 'restored',
    text: `«${originalName}» volvió a ${originalPlaceName(item)}.`,
  };
}

function failureText(name: string, error: unknown): string {
  const code = error instanceof StorageRequestError ? error.code : null;
  if (
    code === STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED &&
    error instanceof StorageRequestError
  ) {
    const maxDepth = String(error.details['maxDepth'] ?? '');
    return `No podemos restaurar «${name}» aquí porque superaría ${maxDepth} niveles de carpetas. Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.`;
  }
  if (code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND) {
    return `No encontramos «${name}» en la papelera. Puede que ya se haya eliminado definitivamente.`;
  }
  return `No pudimos restaurar «${name}». Revisa tu conexión e inténtalo de nuevo.`;
}

/** `422` de profundidad (CA-15), `404` (CA-16) o cualquier otra falla. */
export function restoreFailureLine(item: TrashItem, error: unknown): RestoreLine {
  return { id: item.id, status: 'failed', text: failureText(item.name, error) };
}

function elements(count: number): string {
  return count === 1 ? '1 elemento' : `${String(count)} elementos`;
}

export function restoreResultTitle(lines: readonly RestoreLine[]): string {
  const done = lines.filter((line) => line.status !== 'failed').length;
  if (done === lines.length) return `Restauramos ${elements(done)}`;
  if (lines.length === 1) return 'No pudimos restaurar el elemento';
  return `Restauramos ${String(done)} de ${elements(lines.length)}`;
}

/** Rótulo e ícono por estado: el color no es el único indicio (spec 006 §6). */
const LINE_STYLE = {
  restored: { tag: 'Restaurado.', icon: CircleCheck, tone: 'text-success-foreground' },
  changed: { tag: 'Restaurado con cambios.', icon: Info, tone: 'text-warning-foreground' },
  failed: { tag: 'No restaurado.', icon: CircleX, tone: 'text-destructive' },
} as const;

export interface RestoreResultProps {
  readonly lines: readonly RestoreLine[];
  readonly onDismiss: () => void;
}

/** Panel persistente arriba de la lista con una línea por elemento (CA-14, CA-15, CA-17). */
export function RestoreResult({ lines, onDismiss }: RestoreResultProps): React.JSX.Element {
  const titleId = React.useId();
  return (
    <section
      role="status"
      aria-labelledby={titleId}
      className="rounded-lg border border-border bg-card py-3 pl-4 pr-2 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">
          {restoreResultTitle(lines)}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cerrar resultado"
          onClick={onDismiss}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
      <ul className="space-y-1.5 pr-2">
        {lines.map((line) => {
          const style = LINE_STYLE[line.status];
          const Icon = style.icon;
          return (
            <li key={line.id} className="flex items-start gap-2 text-sm text-foreground">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.tone)} aria-hidden="true" />
              <span className="min-w-0 break-words">
                <span className="font-semibold">{style.tag}</span> {line.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
