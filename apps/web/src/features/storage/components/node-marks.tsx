import type { FileIndexStatus, NodeSummary } from '@nimbo/contracts';
import { CircleAlert, CircleCheck, Info, Loader2, Users } from 'lucide-react';
import type * as React from 'react';

import { StatusBadge, type StatusBadgeProps } from '../../../components/nimbo/status-badge';

/** Mismos textos que el chip de la ficha (019): en cola o en curso se ven igual. */
const INDEXING: StatusBadgeProps = { tone: 'neutral', icon: Loader2, label: 'Indexando…' };
const INDEX_LOOKS: Readonly<Record<FileIndexStatus, StatusBadgeProps>> = {
  pending: INDEXING,
  processing: INDEXING,
  indexed: { tone: 'success', icon: CircleCheck, label: 'Indexado' },
  failed: { tone: 'destructive', icon: CircleAlert, label: 'No se pudo indexar' },
  unsupported: { tone: 'neutral', icon: Info, label: 'No se indexa' },
};

/** Lo que `GET /folders/contents` agrega a cada elemento; lo creado o subido en esta pestaña aún no lo trae. */
interface Marks {
  readonly shared?: boolean;
  readonly indexStatus?: FileIndexStatus;
}

const marksOf = (node: NodeSummary): Marks => node as NodeSummary & Marks;

/**
 * Marcas de una fila del explorador: el estado de indexación de cada archivo y «Compartido/a» si el nodo tiene accesos
 * o un enlace público. Ícono y texto, nunca solo color (ui-guidelines §4).
 */
export function NodeMarks({ node }: { readonly node: NodeSummary }): React.JSX.Element | null {
  const { shared = false, indexStatus } = marksOf(node);
  if (!shared && indexStatus === undefined) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {indexStatus === undefined ? null : (
        <span>
          <span className="sr-only">Estado de indexación: </span>
          <StatusBadge {...INDEX_LOOKS[indexStatus]} />
        </span>
      )}
      {shared ? (
        <StatusBadge
          tone="neutral"
          icon={Users}
          label={node.type === 'folder' ? 'Compartida' : 'Compartido'}
        />
      ) : null}
    </span>
  );
}
