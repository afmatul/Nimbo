import type { ReactNode } from 'react';

import { RequireRole } from '../../../features/access/components/require-role';

/** Rutas del Cliente (003 §6.9); anidadas en `(app)`, que ya exige sesión. */
export default function ClienteGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={['CLIENT']}>{children}</RequireRole>;
}
