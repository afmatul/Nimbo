import type { ReactNode } from 'react';

import { RequireRole } from '../../../../features/access/components/require-role';

/** Área del Administrador (011 CA-14, CA-17): solo ADMIN; otro rol vuelve a su inicio. Anidada en `(interno)`. */
export default function AdminGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={['ADMIN']}>{children}</RequireRole>;
}
