import type { ReactNode } from 'react';

import { RequireRole } from '../../../../features/access/components/require-role';

/** Área del Operador (011 CA-14, CA-17): solo OPERATOR; otro rol vuelve a su inicio. Anidada en `(interno)`. */
export default function OperacionGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={['OPERATOR']}>{children}</RequireRole>;
}
