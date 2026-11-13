import type { IndexingState, IndexingStatusResponse } from '@nimbo/contracts';
import { CircleAlert, CircleCheck, Info, Loader2, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../../lib/utils';

interface ChipLook {
  readonly label: string;
  readonly hint: string | null;
  readonly Icon: LucideIcon;
  readonly className: string;
  /** El ícono gira mientras se indexa; quieto con `prefers-reduced-motion`. */
  readonly spins?: boolean;
}

const NEUTRAL = 'border border-border bg-muted text-secondary-foreground';
/** Como «ACTUAL» del historial: `success-foreground` sobre `success` al 12 % (4.80:1). */
const SUCCESS = 'border border-success/30 bg-success/12 text-success-foreground';
const FAILED = 'border border-destructive-soft/45 bg-destructive-soft/12 text-destructive';
const SPINNING = 'animate-spin motion-reduce:animate-none';

const INDEXING_LOOK: ChipLook = {
  label: 'Indexando…',
  hint: 'Ya puedes seguir trabajando',
  Icon: Loader2,
  className: NEUTRAL,
  spins: true,
};

/** `pendiente` e `indexando` se ven igual: al cliente le da lo mismo si está en cola o en curso (decisión de 019). */
const LOOKS: Record<IndexingState, ChipLook> = {
  pendiente: INDEXING_LOOK,
  indexando: INDEXING_LOOK,
  indexado: {
    label: 'Indexado',
    hint: 'Listo para consultar con el agente',
    Icon: CircleCheck,
    className: SUCCESS,
  },
  no_indexable: {
    label: 'No se indexa',
    hint: 'Se busca solo por nombre',
    Icon: Info,
    className: NEUTRAL,
  },
  fallido: { label: 'No se pudo indexar', hint: null, Icon: CircleAlert, className: FAILED },
};

/** En la tarjeta cabe poco: «Sin indexar» cubre `no_indexable` y `fallido`; el motivo está en la ficha del archivo. */
const CARD_LABELS: Partial<Record<IndexingState, string>> = {
  no_indexable: 'Sin indexar',
  fallido: 'Sin indexar',
};

/**
 * Etiqueta del estado: ícono + texto, nunca solo color. Nada si no hay estado o el tipo no se indexa (imágenes,
 * «otros»). `compact` usa los textos cortos de la tarjeta y la frase como ayuda (`title`) en vez de al lado.
 */
export function IndexingPill({
  status,
  compact = false,
}: {
  readonly status: IndexingStatusResponse | null;
  readonly compact?: boolean;
}): React.JSX.Element | null {
  if (status === null || status.state === null) return null;
  const { label, hint, Icon, className, spins } = LOOKS[status.state];
  const text = (compact && CARD_LABELS[status.state]) || label;
  return (
    <span
      title={compact ? (hint ?? undefined) : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', spins && SPINNING)} aria-hidden="true" />
      <span>
        <span className="sr-only">Estado de indexación: </span>
        <span>{text}</span>
      </span>
    </span>
  );
}

/** Chip del estado de indexación bajo el encabezado de la ficha (019 CA-14), con la frase que lo acompaña. */
export function IndexingStatusChip({
  status,
}: {
  readonly status: IndexingStatusResponse | null;
}): React.JSX.Element | null {
  if (status === null || status.state === null) return null;
  const { hint } = LOOKS[status.state];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <IndexingPill status={status} />
      {hint ? <span className="text-sm text-secondary-foreground">{hint}</span> : null}
    </div>
  );
}
