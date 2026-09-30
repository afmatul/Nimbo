import type { ReactNode } from 'react';

import { RequireRole } from '../../../features/access/components/require-role';
import { INTERNAL_ROLES } from '../../../features/access/home-path';

/** Rutas de las cuentas internas (003 §6.9); anidadas en `(app)`, que ya exige sesión. */
export default function InternoGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={INTERNAL_ROLES}>{children}</RequireRole>;
}
