import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { Button } from '../../../components/ui/button';
import { formatCount } from '../../../lib/format-plan';

export interface PagePagerProps {
  /** Nombre accesible de la navegación («Paginación de los archivos de Laura Barrios»). */
  readonly label: string;
  /** Qué se cuenta, en plural («archivos», «cuentas»). */
  readonly noun: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
}

/** «Anterior» o «Siguiente»: 44 px en móvil; deshabilitado en el extremo de la lista. */
function PageButton({
  disabled,
  onClick,
  children,
}: {
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 sm:h-9"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function rangeText({ noun, page, pageSize, total }: PagePagerProps): string {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `Mostrando ${formatCount(first)}–${formatCount(last)} de ${formatCount(total)} ${noun}`;
}

/**
 * Paginación por número de las listas internas (011, DF-66; mockups `backoffice/admin` y `backoffice/soporte`): el rango
 * en texto, «Anterior», «Página N de M» y «Siguiente», con objetivos de 44 px en móvil.
 */
export function PagePager(props: PagePagerProps): JSX.Element {
  const { label, page, pageSize, total, onPageChange } = props;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label={label}
      className="mt-3.5 flex flex-col gap-2.5 text-sm text-secondary-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-center tabular-nums sm:text-left">{rangeText(props)}</p>
      <div className="flex items-center justify-between gap-2">
        <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </PageButton>
        <span className="whitespace-nowrap px-1 tabular-nums">{`Página ${formatCount(page)} de ${formatCount(pages)}`}</span>
        <PageButton disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Siguiente
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PageButton>
      </div>
    </nav>
  );
}
