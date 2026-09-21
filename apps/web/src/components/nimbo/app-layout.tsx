'use client';

import { Cloud, Menu, X, Folder, Share2, Trash2, CreditCard, Sparkles } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface AppLayoutProps {
  readonly children: React.ReactNode;
  readonly userEmail?: string;
}

/**
 * Layout base responsivo de Nimbo.
 * Diseñado desde 360 px (móvil) hasta escritorio, con navegación accesible,
 * áreas táctiles mínimas de 44 px y sin desbordamiento horizontal (CA-5).
 */
export function AppLayout({ children, userEmail }: AppLayoutProps): React.JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems = [
    { label: 'Mis Archivos', icon: Folder, href: '#archivos', active: true },
    { label: 'Compartidos', icon: Share2, href: '#compartidos' },
    { label: 'Papelera', icon: Trash2, href: '#papelera' },
    { label: 'Planes y Cuota', icon: CreditCard, href: '#planes' },
    { label: 'Agente Nimbo', icon: Sparkles, href: '#agente' },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground overflow-x-hidden">
      {/* Header superior */}
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <button
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-button">
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
        {/* Sidebar desktop */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:flex md:flex-col md:justify-between">
          <nav className="space-y-1.5" aria-label="Navegación principal">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

        {/* Sidebar móvil (Drawer) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            <aside className="relative flex w-full max-w-xs flex-1 flex-col bg-card p-5 shadow-modal">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <Cloud className="h-6 w-6 text-primary" aria-hidden="true" />
                  <span className="font-bold text-lg text-foreground">Nimbo</span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Cerrar menú"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>

              <nav className="mt-4 flex-1 space-y-1" aria-label="Navegación móvil">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

        {/* Área de contenido principal */}
        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
