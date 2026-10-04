import type { ReactNode } from 'react';

import { TrashView } from '../../../../features/storage/components/trash-view';

/**
 * Papelera (006): lo eliminado con su fecha de purga, restaurar, eliminar definitivamente y vaciar. Sin descarga ni
 * vista previa (CA-12). Vive en `(cliente)`: los roles internos no llegan (CA-23).
 */
export default function PapeleraPage(): ReactNode {
  return <TrashView />;
}
