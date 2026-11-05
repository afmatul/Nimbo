'use client';

import * as React from 'react';

/**
 * Última lectura de cada vista, para pintarla al instante al volver a ella mientras se relee (mostrar lo anterior y
 * revalidar). Vive en memoria de la pestaña y dentro de `(cliente)`: al cerrar sesión se desmonta con el grupo, así que
 * nunca pasa de una cuenta a otra. Fuera del proveedor (pruebas aisladas) no guarda nada.
 */
export interface ViewCache {
  readonly get: <T>(key: string) => T | undefined;
  readonly set: <T>(key: string, value: T) => void;
}

const NO_CACHE: ViewCache = { get: () => undefined, set: () => undefined };

const ViewCacheContext = React.createContext<ViewCache>(NO_CACHE);

export function ViewCacheProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [cache] = React.useState<ViewCache>(() => {
    const entries = new Map<string, unknown>();
    return {
      get: <T,>(key: string) => entries.get(key) as T | undefined,
      set: (key, value) => void entries.set(key, value),
    };
  });
  return <ViewCacheContext.Provider value={cache}>{children}</ViewCacheContext.Provider>;
}

export function useViewCache(): ViewCache {
  return React.useContext(ViewCacheContext);
}
