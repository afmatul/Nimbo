'use client';

import { Trash2 } from 'lucide-react';
import * as React from 'react';

import { DropdownMenuItem } from '../../../components/ui/dropdown-menu';

/**
 * «Mover a la papelera» del menú ⋮ de archivos y carpetas (CA-10, CA-11). Sin color destructivo: es reversible y no
 * pide confirmación; el rojo queda para «Eliminar definitivamente» (spec 006 §6).
 */
export function MoveToTrashMenuItem({
  onSelect,
}: {
  readonly onSelect: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Trash2 className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
      Mover a la papelera
    </DropdownMenuItem>
  );
}
