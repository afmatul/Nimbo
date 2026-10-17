import { INTERNAL_ROLES } from '@nimbo/contracts';
import type { ReactNode } from 'react';

import { RequireRole } from '../../../features/access/components/require-role';

/** Rutas de las cuentas internas (003 §6.9); anidadas en `(app)`, que ya exige sesión. */
export default function InternoGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={INTERNAL_ROLES}>{children}</RequireRole>;
}
