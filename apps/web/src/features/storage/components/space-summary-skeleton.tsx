import { Loader2 } from 'lucide-react';
import type * as React from 'react';

import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';

const LINE = 'block h-3 animate-pulse rounded-md bg-muted motion-reduce:animate-none';

/** Tarjeta de esqueleto: una línea por clase de tamaño (distintas entre sí: sirven de `key`). */
function SkeletonCard({
  lines,
  className,
}: {
  readonly lines: readonly string[];
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Card className={cn('flex min-h-44 flex-col gap-3.5 p-5', className)}>
      {lines.map((line) => (
        <span key={line} className={cn(LINE, line)} />
      ))}
    </Card>
  );
}

/** Medidor: título, cifra grande, barra y fila de cifras (mockup `resumen-espacio--cargando`). */
const USAGE_LINES = ['w-1/3', 'h-7 w-2/5', 'h-2.5 w-full', 'w-3/5'];
const PLAN_LINES = ['w-1/3', 'h-6 w-1/2', 'w-4/5', 'w-3/5'];
const BREAKDOWN_LINES = ['w-1/3', 'h-3.5 w-full', 'w-2/3', 'w-1/2', 'w-2/5'];

/**
 * Cargando el resumen (CA-8): esqueleto con la forma de las tres tarjetas (oculto a lectores de pantalla) y
 * «Calculando tu espacio…» como estado anunciado. Sin animación con `prefers-reduced-motion`.
 */
export function SpaceSummarySkeleton(): React.JSX.Element {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div data-space-skeleton="" aria-hidden="true" className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard lines={USAGE_LINES} className="lg:col-span-2" />
          <SkeletonCard lines={PLAN_LINES} />
        </div>
        <SkeletonCard lines={BREAKDOWN_LINES} />
      </div>
      <p
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 text-sm font-medium text-secondary-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Calculando tu espacio…
      </p>
    </div>
  );
}
