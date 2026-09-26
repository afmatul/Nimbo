'use client';

import type { LucideIcon } from 'lucide-react';
import { Cloud, Menu, X, Folder, Share2, Trash2, CreditCard, Sparkles } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly active?: boolean;
}

export const DEFAULT_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Mis Archivos', icon: Folder, href: '#archivos', active: true },
  { label: 'Compartidos', icon: Share2, href: '#compartidos' },
  { label: 'Papelera', icon: Trash2, href: '#papelera' },
  { label: 'Planes y Cuota', icon: CreditCard, href: '#planes' },
  { label: 'Agente Nimbo', icon: Sparkles, href: '#agente' },
];

export interface AppLayoutProps {
  readonly children: React.ReactNode;
  readonly userEmail?: string;
  readonly initialMobileMenuOpen?: boolean;
  readonly navItems?: readonly NavItem[];
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
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden text-xs text-muted-foreground sm:inline-block font-mono">
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
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
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
              /* TODO: token de velo/overlay pendiente en design system */
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
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </nav>
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
    </div>
  );
}
