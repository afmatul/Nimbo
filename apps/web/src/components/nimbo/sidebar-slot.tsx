'use client';

import * as React from 'react';

/**
 * Dónde se dibuja la sección de la página en la barra lateral (006 CA-27): en el cajón móvil los objetivos miden 44 px.
 * Los enlaces cierran el cajón solos (`MobileNavDrawer`); un control que no es enlace (p. ej. abrir un archivo) llama a
 * `onNavigate` para cerrarlo.
 */
export interface SidebarSlot {
  readonly inDrawer: boolean;
  readonly onNavigate: () => void;
}

const DESKTOP_SLOT: SidebarSlot = { inDrawer: false, onNavigate: () => undefined };

const SidebarSlotContext = React.createContext<SidebarSlot>(DESKTOP_SLOT);

export const SidebarSlotProvider = SidebarSlotContext.Provider;

/** Lugar de la sección: la barra de escritorio (por omisión) o el cajón móvil. */
export function useSidebarSlot(): SidebarSlot {
  return React.useContext(SidebarSlotContext);
}
