import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { cn } from '../../lib/utils';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly active?: boolean;
}

/** Enlace de la Papelera, el que lleva el contador (006). */
export const TRASH_HREF = '/papelera';

type SidebarVariant = 'desktop' | 'mobile';

interface VariantStyles {
  readonly navLabel: string;
  readonly nav: string;
  readonly link: string;
  readonly icon: string;
  readonly active: string;
}

/** Diferencias de la barra entre escritorio y cajón móvil; el resto del cuerpo es común. */
const VARIANT_STYLES: Readonly<Record<SidebarVariant, VariantStyles>> = {
  desktop: {
    navLabel: 'Navegación principal',
    nav: 'space-y-1.5',
    link: 'py-2 text-sm',
    icon: 'h-4 w-4',
    // S-2: border-l-primary en vez de border-l-brand (ui-guidelines.md §5) para maximizar el contraste del ítem activo
    active: 'bg-accent text-primary font-semibold border-l-[3px] border-l-primary',
  },
  mobile: {
    navLabel: 'Navegación móvil',
    nav: 'mt-4 space-y-1',
    link: 'py-2.5 text-base',
    icon: 'h-5 w-5',
    active: 'bg-accent text-primary font-semibold',
  },
};

const LINK_BASE_CLASS =
  'flex min-h-11 items-center gap-3 rounded-md px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const LINK_IDLE_CLASS = 'text-secondary-foreground hover:bg-accent/60 hover:text-foreground';

export interface AppSidebarProps {
  readonly variant: SidebarVariant;
  readonly navItems: readonly NavItem[];
  readonly trashCount?: number | undefined;
  readonly section?: React.ReactNode;
  readonly quotaCard?: React.ReactNode;
}

/** Texto del ítem y, en la Papelera, su contador («6», leído como «Papelera (6 elementos)»). */
function NavLabel({
  item,
  trashCount,
}: {
  readonly item: NavItem;
  readonly trashCount: number | undefined;
}): React.JSX.Element {
  const count = item.href === TRASH_HREF && trashCount ? trashCount : 0;
  return (
    <>
      <span>{item.label}</span>
      {count > 0 ? (
        <span className="ml-auto text-xs font-medium tabular-nums text-secondary-foreground">
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{`(${String(count)} ${count === 1 ? 'elemento' : 'elementos'})`}</span>
        </span>
      ) : null}
    </>
  );
}

function SidebarNav({
  variant,
  navItems,
  trashCount,
}: Omit<AppSidebarProps, 'section' | 'quotaCard'>): React.JSX.Element {
  const styles = VARIANT_STYLES[variant];
  return (
    <nav className={cn('shrink-0', styles.nav)} aria-label={styles.navLabel}>
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              LINK_BASE_CLASS,
              styles.link,
              item.active ? styles.active : LINK_IDLE_CLASS,
            )}
          >
            <Icon className={cn('shrink-0', styles.icon)} aria-hidden="true" />
            <NavLabel item={item} trashCount={trashCount} />
          </a>
        );
      })}
    </nav>
  );
}

/** Pie de la barra con la tarjeta de cuota (007 CA-5), fuera de la región que se desplaza (CA-19). */
function QuotaSlot({ card }: { readonly card: React.ReactNode }): React.JSX.Element | null {
  if (card === undefined || card === null) return null;
  return (
    <div data-quota-card="" className="mt-6 shrink-0">
      {card}
    </div>
  );
}

/**
 * Cuerpo de la barra lateral, común a escritorio y cajón móvil (007 CA-19): navegación arriba, región central con las
 * sección que pase cada página (desplazamiento propio si no cabe) y tarjeta de cuota siempre visible al pie.
 * El contenedor debe ser una columna flex de alto acotado. El margen negativo con relleno deja ver el anillo de foco.
 */
export function AppSidebar({ section, quotaCard, ...nav }: AppSidebarProps): React.JSX.Element {
  return (
    <>
      <SidebarNav {...nav} />
      <div data-sidebar-section="" className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {section}
      </div>
      <QuotaSlot card={quotaCard} />
    </>
  );
}
