'use client';

import type { RoleName } from '@nimbo/contracts';
import { FileSearch, Users } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { AppLayout, type NavItem } from '../../../components/nimbo/app-layout';
import { useSession } from '../../identity/session/session-provider';
import { INTERNAL_PATHS } from '../home-path';
import { ROLE_LABELS } from '../role-labels';

type NavEntry = Omit<NavItem, 'active'>;

/**
 * Lo que cada rol puede abrir en su área (matriz §2 de 011, CA-14). Cada entrada llega con su página: Catálogo de
 * planes y Métricas del Administrador y Métricas del Operador, en T-11.
 */
const INTERNAL_NAV: Readonly<Record<RoleName, readonly NavEntry[]>> = {
  CLIENT: [],
  ADMIN: [{ label: 'Cuentas', icon: Users, href: INTERNAL_PATHS.adminAccounts }],
  SUPPORT: [
    { label: 'Metadatos de archivos', icon: FileSearch, href: INTERNAL_PATHS.supportFiles },
  ],
  OPERATOR: [],
};

/** Navegación del área del rol con la entrada `activeHref` marcada (ninguna en Seguridad y Mi actividad). */
export function internalNavFor(role: RoleName, activeHref?: string): readonly NavItem[] {
  return INTERNAL_NAV[role].map((entry) => ({ ...entry, active: entry.href === activeHref }));
}

/** Quién usa el área, al pie de la barra (mockups de `backoffice/`): nombre y rol, sin datos de clientes. */
function AreaPersona({
  fullName,
  role,
}: {
  readonly fullName: string;
  readonly role: RoleName;
}): JSX.Element {
  return (
    <section
      aria-label="Tu cuenta"
      className="rounded-lg border border-border bg-card px-3.5 py-3 text-sm"
    >
      <p className="font-semibold text-foreground">{fullName}</p>
      <p className="mt-0.5 text-xs text-secondary-foreground">{ROLE_LABELS[role]}</p>
    </section>
  );
}

export interface InternalAreaLayoutProps {
  readonly children: ReactNode;
  /** Ruta de la entrada de la navegación que corresponde a la página. */
  readonly activeHref?: string;
}

/**
 * Marco del área de Administrador, Soporte y Operador (011 CA-17, plan §2): el `AppLayout` con la navegación del rol y
 * su persona al pie. Sin sesión no decide: de eso se encarga `SessionGate`.
 */
export function InternalAreaLayout({
  children,
  activeHref,
}: InternalAreaLayoutProps): JSX.Element | null {
  const { user } = useSession();
  if (user === null) return null;
  return (
    <AppLayout
      navItems={internalNavFor(user.role, activeHref)}
      quotaCard={<AreaPersona fullName={user.fullName} role={user.role} />}
    >
      {children}
    </AppLayout>
  );
}
