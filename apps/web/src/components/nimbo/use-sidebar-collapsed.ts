'use client';

import * as React from 'react';

const STORAGE_KEY = 'nimbo.sidebar.collapsed';

export interface SidebarCollapse {
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Sin almacenamiento (ventana privada): la barra funciona igual, solo no recuerda la preferencia.
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Barra lateral de escritorio compacta o expandida. La preferencia se recuerda en este navegador; el servidor y el
 * primer render la dan expandida y el navegador la aplica enseguida, sin desajuste de hidratación.
 */
export function useSidebarCollapsed(): SidebarCollapse {
  const collapsed = React.useSyncExternalStore(subscribe, readStored, () => false);
  const toggle = React.useCallback(() => {
    writeStored(!readStored());
    listeners.forEach((notify) => notify());
  }, []);
  return { collapsed, toggle };
}
