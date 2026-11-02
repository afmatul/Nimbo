'use client';

import { Cloud, Menu, Folder, Search, Share2, Trash2, HardDrive, Sparkles } from 'lucide-react';
import type * as React from 'react';

import { cn } from '../../lib/utils';
import { Toaster } from '../ui/sonner';

import { useAgentEntry } from './agent-entry';
import { AppSidebar, TRASH_HREF, type AppSidebarProps, type NavItem } from './app-sidebar';
import { useHeaderAccount } from './header-account';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { useIsAgentSheet } from './use-agent-sheet';
import { useMobileNav, type MobileNav } from './use-mobile-nav';

export type { NavItem };

/**
 * «Espacio» reemplaza a «Planes y Cuota» hasta 009 (007 D-18, PD-92); «Buscar» es la entrada de la búsqueda (018
 * CA-12). «Agente Nimbo» no está aquí: lo suma el layout solo con la entrada del agente (020b D-4, CA-18).
 */
export const DEFAULT_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Mis Archivos', icon: Folder, href: '/archivos', active: true },
  { label: 'Buscar', icon: Search, href: '/buscar' },
  { label: 'Compartidos', icon: Share2, href: '#compartidos' },
  { label: 'Papelera', icon: Trash2, href: TRASH_HREF },
  { label: 'Espacio', icon: HardDrive, href: '/espacio' },
];

interface AgentLayout {
  readonly navItems: readonly NavItem[];
  readonly panel: React.ReactNode;
  /** El panel abierto como complemento de escritorio: `main` le cede su ancho (020b D-5). */
  readonly reservesPanel: boolean;
}

/** Con la entrada del agente (layout del Cliente), «Agente Nimbo» al final de la navegación y su panel abierto. */
function useAgentLayout(navItems: readonly NavItem[]): AgentLayout {
  const entry = useAgentEntry();
  const isSheet = useIsAgentSheet();
  if (entry === null) return { navItems, panel: null, reservesPanel: false };
  const agentItem: NavItem = {
    label: 'Agente Nimbo',
    icon: Sparkles,
    href: '#agente',
    onSelect: entry.open,
  };
  const isOpen = entry.panel !== null && entry.panel !== undefined;
  return {
    navItems: [...navItems, agentItem],
    panel: entry.panel,
    reservesPanel: isOpen && !isSheet,
  };
}

export interface AppLayoutProps {
  readonly children: React.ReactNode;
  readonly userEmail?: string;
  readonly initialMobileMenuOpen?: boolean;
  readonly navItems?: readonly NavItem[];
  /** Contenido de la barra superior en escritorio, junto al logo (p. ej. las migas de Mis archivos, 006). */
  readonly topBar?: React.ReactNode;
  /**
   * Sección propia de la página en la región central de la barra lateral y del menú móvil, con desplazamiento propio
   * (007 CA-19; p. ej. «Accesos rápidos» de Mis archivos, 006 CA-27). Sabe dónde está con `useSidebarSlot()`.
   */
  readonly sidebarSection?: React.ReactNode;
  /** Elementos en la papelera (`GET /trash/summary`); sin dato o en 0 no se muestra (006). */
  readonly trashCount?: number | undefined;
  /** Tarjeta de cuota al pie de la barra lateral y del menú móvil (007); sin ella no se reserva espacio. */
  readonly quotaCard?: React.ReactNode;
}

interface AppHeaderProps {
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly menuButtonRef: MobileNav['menuButtonRef'];
  readonly topBar: React.ReactNode;
  readonly userEmail: string | undefined;
}

function AppHeader({
  menuOpen,
  onToggleMenu,
  menuButtonRef,
  topBar,
  userEmail,
}: AppHeaderProps): React.JSX.Element {
  return (
    <header
      inert={menuOpen ? true : undefined}
      className="sticky top-0 z-40 flex h-header w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Abrir menú de navegación"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <BrandLink />
        {topBar ? <div className="hidden min-w-0 md:ml-6 md:flex">{topBar}</div> : null}
      </div>
      <div className="flex items-center gap-3">
        <HeaderAccount userEmail={userEmail} />
      </div>
    </header>
  );
}

/** El menú de la cuenta del grupo con sesión (002 CA-14); fuera de él, solo el correo si lo hay. */
function HeaderAccount({ userEmail }: { readonly userEmail: string | undefined }): React.ReactNode {
  const account = useHeaderAccount();
  if (account) return account;
  if (!userEmail) return null;
  return <span className="hidden text-xs text-muted-foreground sm:inline-block">{userEmail}</span>;
}

function BrandLink(): React.JSX.Element {
  return (
    <a
      href="/"
      className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-button">
        <Cloud className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className="text-xl font-bold tracking-tight text-foreground">Nimbo</span>
    </a>
  );
}

/** Barra lateral de escritorio, fija bajo el encabezado (007 CA-19); `inert` tras el cajón móvil. */
function DesktopSidebar({
  behindDrawer,
  sidebar,
}: {
  readonly behindDrawer: true | undefined;
  readonly sidebar: Omit<AppSidebarProps, 'variant'>;
}): React.JSX.Element {
  return (
    <aside
      inert={behindDrawer}
      className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:sticky md:top-header md:flex md:h-below-header md:flex-col md:self-start"
      aria-label="Barra lateral de escritorio"
    >
      <AppSidebar variant="desktop" {...sidebar} />
    </aside>
  );
}

/**
 * Layout base responsivo de Nimbo, desde 360 px hasta escritorio, con navegación accesible, áreas táctiles de 44 px y
 * sin desbordamiento horizontal (CA-5). La página se desplaza con la ventana; la barra de escritorio queda fija bajo el
 * encabezado (007 CA-19). `overflow-x-clip` y no `hidden`: `hidden` vuelve la raíz contenedor de desplazamiento y rompe
 * `sticky`.
 */
export function AppLayout({
  children,
  userEmail,
  initialMobileMenuOpen = false,
  navItems = DEFAULT_NAV_ITEMS,
  topBar,
  sidebarSection,
  trashCount,
  quotaCard,
}: AppLayoutProps): React.JSX.Element {
  const { open, toggle, close, menuButtonRef } = useMobileNav(initialMobileMenuOpen);
  const agent = useAgentLayout(navItems);
  const sidebar = { navItems: agent.navItems, trashCount, section: sidebarSection, quotaCard };
  const behindDrawer = open ? true : undefined;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground overflow-x-clip">
      <AppHeader
        menuOpen={open}
        onToggleMenu={toggle}
        menuButtonRef={menuButtonRef}
        topBar={topBar}
        userEmail={userEmail}
      />
      <div className="flex flex-1 min-w-0">
        <DesktopSidebar behindDrawer={behindDrawer} sidebar={sidebar} />
        {open ? (
          <MobileNavDrawer onClose={close}>
            <AppSidebar variant="mobile" {...sidebar} />
          </MobileNavDrawer>
        ) : null}
        <main
          inert={behindDrawer}
          className={cn(
            'flex-1 p-4 md:p-8 min-w-0',
            agent.reservesPanel && 'mr-(--agent-panel-width)',
          )}
        >
          {children}
        </main>
      </div>
      {agent.panel}
      <Toaster />
    </div>
  );
}
