import type { ReactNode } from 'react';

import { RequireRole } from '../../../../features/access/components/require-role';

/** Área de Soporte (011 CA-14, CA-17): solo SUPPORT; otro rol vuelve a su inicio. Anidada en `(interno)`. */
export default function SoporteGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={['SUPPORT']}>{children}</RequireRole>;
}
