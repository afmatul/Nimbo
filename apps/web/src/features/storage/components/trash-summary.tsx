import { formatBytes, type TrashSummary as TrashSummaryData } from '@nimbo/contracts';
import { Clock, HardDrive, Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { PURGE_SOON_DAYS } from '../trash-dates';

export function retentionLabel(days: number): string {
  return days === 1 ? '1 día' : `${String(days)} días`;
}

function Stat({
  icon: Icon,
  label,
  value,
  help,
}: {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly value: string;
  readonly help: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-secondary-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-sm text-secondary-foreground">{help}</p>
      </div>
    </div>
  );
}

/** Espacio que ocupa la papelera y retención del plan, arriba de la lista (CA-12, decisión 9 del mockup). */
export function TrashSummary({
  summary,
}: {
  readonly summary: TrashSummaryData;
}): React.JSX.Element {
  return (
    <section
      aria-label="Resumen de la papelera"
      className="grid divide-y divide-border rounded-lg border border-border bg-card shadow-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0"
    >
      <Stat
        icon={HardDrive}
        label="Espacio que ocupa"
        value={formatBytes(summary.totalBytes)}
        help="Cuenta contra tu cuota hasta que se elimine definitivamente."
      />
      <Stat
        icon={Clock}
        label="Retención de tu plan"
        value={retentionLabel(summary.retentionDays)}
        help="Después, cada elemento se elimina definitivamente."
      />
    </section>
  );
}

/** Aviso de purga próxima (≤ 7 días, umbral de la UI); no aparece si no hay ninguno (spec 006 §6). */
export function PurgeSoonNote({ count }: { readonly count: number }): React.JSX.Element | null {
  if (count === 0) return null;
  const what = count === 1 ? '1 elemento se eliminará' : `${String(count)} elementos se eliminarán`;
  return (
    <Alert variant="warning" role="note" className="flex items-start gap-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">
          {`${what} definitivamente en los próximos ${String(PURGE_SOON_DAYS)} días.`}
        </strong>{' '}
        <span className="text-foreground">Restáuralos antes de esa fecha si los necesitas.</span>
      </p>
    </Alert>
  );
}

/** Vaciado diferido en curso (`202`, CA-18): el espacio baja cuando termina el trabajo. */
export function EmptyingNotice({
  pendingBytes,
}: {
  readonly pendingBytes: number;
}): React.JSX.Element {
  return (
    <Alert variant="info" className="flex items-start gap-3 bg-muted">
      <Loader2
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p>
        <strong className="font-semibold">Estamos vaciando la papelera.</strong>{' '}
        {`Liberaremos ${formatBytes(pendingBytes)} cuando termine; puedes seguir usando Nimbo mientras tanto.`}
      </p>
    </Alert>
  );
}
