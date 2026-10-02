'use client';

import type { LucideIcon } from 'lucide-react';
import { Cloud, Menu, X, Folder, Share2, Trash2, HardDrive, Sparkles } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Toaster } from '../ui/sonner';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly active?: boolean;
}

/** Dónde se dibuja `sidebarSection`: en el cajón, los objetivos miden 44 px y elegir un enlace lo cierra. */
export interface SidebarSlot {
  readonly inDrawer: boolean;
  readonly onNavigate: () => void;
}

const DESKTOP_SLOT: SidebarSlot = { inDrawer: false, onNavigate: () => undefined };

const SidebarSlotContext = React.createContext<SidebarSlot>(DESKTOP_SLOT);

/** Lugar de `sidebarSection`: la barra de escritorio (por omisión) o el cajón móvil. */
export function useSidebarSlot(): SidebarSlot {
  return React.useContext(SidebarSlotContext);
}

/** Enlace de la Papelera, el que lleva el contador (006). «Espacio» reemplaza a «Planes y Cuota» hasta 008 (007 D-18). */
const TRASH_HREF = '/papelera';

export const DEFAULT_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Mis Archivos', icon: Folder, href: '/archivos', active: true },
  { label: 'Compartidos', icon: Share2, href: '#compartidos' },
  { label: 'Papelera', icon: Trash2, href: TRASH_HREF },
  { label: 'Espacio', icon: HardDrive, href: '/espacio' },
  { label: 'Agente Nimbo', icon: Sparkles, href: '#agente' },
];

export interface AppLayoutProps {
  readonly children: React.ReactNode;
  readonly userEmail?: string;
  readonly initialMobileMenuOpen?: boolean;
  readonly navItems?: readonly NavItem[];
  /** Contenido de la barra superior en escritorio, junto al logo (p. ej. las migas de Mis archivos, 006). */
  readonly topBar?: React.ReactNode;
  /**
   * Sección de la página al final de la navegación, en la barra de escritorio y en el cajón móvil (p. ej. «Accesos
   * rápidos» de Mis archivos, 006 CA-27). Sabe dónde está con `useSidebarSlot()`.
   */
  readonly sidebarSection?: React.ReactNode;
  /** Elementos en la papelera (`GET /trash/summary`); sin dato o en 0 no se muestra (006). */
  readonly trashCount?: number | undefined;
  /** Tarjeta de cuota al pie de la barra lateral y del menú móvil (007); sin ella no se reserva espacio. */
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

/** Pie de la barra lateral con la tarjeta de cuota (007 CA-5). */
function QuotaSlot({ card }: { readonly card: React.ReactNode }): React.JSX.Element | null {
  if (card === undefined || card === null) return null;
  return (
    <div data-quota-card="" className="mt-6">
      {card}
    </div>
  );
}

/**
 * Layout base responsivo de Nimbo.
 * Diseñado desde 360 px (móvil) hasta escritorio, con navegación accesible,
 * áreas táctiles mínimas de 44 px y sin desbordamiento horizontal (CA-5).
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
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(initialMobileMenuOpen);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = React.useRef<HTMLAnchorElement>(null);

  const handleCloseMenu = () => {
    setMobileMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  // Cambio 1: Mueve el foco automáticamente al primer enlace del menú al abrirse
  React.useEffect(() => {
    if (mobileMenuOpen) {
      firstNavLinkRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  // Cambio 2: Cierra el menú al presionar la tecla Escape y devuelve el foco al botón de abrir
  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground overflow-x-hidden">
      {/* Header superior — Cambio 4: Bloqueado con inert si el menú móvil está abierto */}
      <header
        inert={mobileMenuOpen ? true : undefined}
        className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label="Abrir menú de navegación"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>

          <a
            href="/"
            className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-button">
              <Cloud className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">Nimbo</span>
          </a>
          {topBar ? <div className="hidden min-w-0 md:ml-6 md:flex">{topBar}</div> : null}
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden text-xs text-muted-foreground sm:inline-block">
              {userEmail}
            </span>
          )}
        </div>
      </header>

      {/* Contenedor cuerpo (Sidebar + Main) */}
      <div className="flex flex-1 min-w-0">
        {/* Sidebar desktop — Bloqueado con inert si el menú móvil está abierto */}
        <aside
          inert={mobileMenuOpen ? true : undefined}
          className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:flex md:flex-col md:justify-between"
          aria-label="Barra lateral de escritorio"
        >
          <nav className="space-y-1.5" aria-label="Navegación principal">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    // S-2: Se usa border-l-primary en vez de border-l-brand (ui-guidelines.md §5) para maximizar el contraste y la distinción accesible del ítem activo
                    item.active
                      ? 'bg-accent text-primary font-semibold border-l-[3px] border-l-primary'
                      : 'text-secondary-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <NavLabel item={item} trashCount={trashCount} />
                </a>
              );
            })}
            {sidebarSection}
          </nav>
          <QuotaSlot card={quotaCard} />
        </aside>

        {/* Sidebar móvil (Drawer) — Cambio 3: aria-labelledby="mobile-menu-title" */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 flex md:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
          >
            <div
              /* TODO: token de velo/overlay pendiente (#6) */
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={handleCloseMenu}
              aria-hidden="true"
            />

            <aside
              className="relative flex w-full max-w-xs flex-1 flex-col bg-card p-5 shadow-modal"
              aria-label="Barra lateral móvil"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <Cloud className="h-6 w-6 text-primary" aria-hidden="true" />
                  <span className="font-bold text-lg text-foreground">Nimbo</span>
                  <h2 id="mobile-menu-title" className="sr-only">
                    Menú de navegación
                  </h2>
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Cerrar menú"
                  onClick={handleCloseMenu}
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              <nav className="mt-4 flex-1 space-y-1" aria-label="Navegación móvil">
                {navItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <a
                      ref={index === 0 ? firstNavLinkRef : undefined}
                      key={item.label}
                      href={item.href}
                      onClick={handleCloseMenu}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        item.active
                          ? 'bg-accent text-primary font-semibold'
                          : 'text-secondary-foreground hover:bg-accent/60 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <NavLabel item={item} trashCount={trashCount} />
                    </a>
                  );
                })}
                <SidebarSlotContext.Provider
                  value={{ inDrawer: true, onNavigate: handleCloseMenu }}
                >
                  {sidebarSection}
                </SidebarSlotContext.Provider>
              </nav>
              <QuotaSlot card={quotaCard} />
            </aside>
          </div>
        )}

        {/* Área de contenido principal — Cambio 4: Bloqueado con inert si el menú móvil está abierto */}
        <main
          inert={mobileMenuOpen ? true : undefined}
          className="flex-1 p-4 md:p-8 min-w-0 overflow-y-auto"
        >
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
