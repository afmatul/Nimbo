'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { BrandMark } from './brand-mark';
import { SidebarSlotProvider, type SidebarSlot } from './sidebar-slot';

export interface MobileNavDrawerProps {
  /** Cierra el cajón (y devuelve el foco al botón del menú). */
  readonly onClose: () => void;
  /** Cuerpo de la barra (`AppSidebar` en su variante móvil). */
  readonly children: React.ReactNode;
}

/** Al abrir lleva el foco al primer enlace; Escape cierra el cajón. */
function useDrawerFocus(panelRef: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  React.useEffect(() => {
    panelRef.current?.querySelector('a')?.focus();
  }, [panelRef]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}

function DrawerTitleBar({ onClose }: Pick<MobileNavDrawerProps, 'onClose'>): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border pb-4">
      <div className="flex items-center gap-2">
        <BrandMark className="h-7 w-auto" />
        <span className="font-bold text-lg text-foreground">Nimbo</span>
        <h2 id="mobile-menu-title" className="sr-only">
          Menú de navegación
        </h2>
      </div>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Cerrar menú"
        onClick={onClose}
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Cajón de navegación móvil (diálogo modal). Activar cualquier enlace de su interior lo cierra (delegación de
 * eventos); la sección de la página sabe que está en el cajón por `useSidebarSlot()` (objetivos de 44 px, 006 CA-27).
 */
export function MobileNavDrawer({ onClose, children }: MobileNavDrawerProps): React.JSX.Element {
  const panelRef = React.useRef<HTMLElement>(null);
  useDrawerFocus(panelRef, onClose);
  const slot = React.useMemo<SidebarSlot>(
    () => ({ inDrawer: true, onNavigate: onClose }),
    [onClose],
  );

  const closeOnLink = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('a')) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-menu-title"
    >
      <div
        /* TODO: token de velo/overlay pendiente (#6) */
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        onClick={closeOnLink}
        className="relative flex w-full max-w-xs flex-1 flex-col bg-card p-5 shadow-modal"
        aria-label="Barra lateral móvil"
      >
        <DrawerTitleBar onClose={onClose} />
        <SidebarSlotProvider value={slot}>{children}</SidebarSlotProvider>
      </aside>
    </div>
  );
}
