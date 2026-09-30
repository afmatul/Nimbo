import type { ReactNode } from 'react';

import { RequireRole } from '../../../features/access/components/require-role';
import { CLIENT_ROLES } from '../../../features/access/home-path';

/** Rutas del Cliente (003 §6.9); anidadas en `(app)`, que ya exige sesión. */
export default function ClienteGroupLayout({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <RequireRole allowed={CLIENT_ROLES}>{children}</RequireRole>;
}
