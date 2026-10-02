'use client';

import type { SpaceSummaryResponse } from '@nimbo/contracts';
import * as React from 'react';

import { useUploads } from '../hooks/use-upload-manager';
import type { SpaceApi } from '../space-api';

export type SpaceSummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly summary: SpaceSummaryResponse };

export interface SpaceContextValue {
  readonly state: SpaceSummaryState;
  /** Vuelve a pedir el resumen tras una operación propia (CA-4); la cifra visible se conserva hasta la respuesta. */
  readonly refresh: () => void;
}

const SpaceContext = React.createContext<SpaceContextValue | null>(null);

const LOADING: SpaceSummaryState = { status: 'loading' };

/** Resumen de espacio compartido de la pestaña. Solo dentro de `<SpaceProvider>`. */
export function useSpace(): SpaceContextValue {
  const value = React.useContext(SpaceContext);
  if (value === null) throw new Error('useSpace debe usarse dentro de <SpaceProvider>.');
  return value;
}

/** Una lectura de `GET /storage/summary` por intento; una respuesta de un intento anterior se descarta. */
function useSpaceSummary(api: SpaceApi): SpaceContextValue {
  const [state, setState] = React.useState<SpaceSummaryState>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    api.spaceSummary().then(
      (summary) => {
        if (current) setState({ status: 'ready', summary });
      },
      () => {
        if (current) setState({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, attempt]);

  const refresh = React.useCallback(() => {
    setState((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  return React.useMemo(() => ({ state, refresh }), [state, refresh]);
}

/** Refresca cuando cambia `count`; el valor del montaje no cuenta (la primera lectura ya está en curso). */
function useRefreshOnChange(count: number, refresh: () => void): void {
  const seen = React.useRef(count);
  React.useEffect(() => {
    if (seen.current === count) return;
    seen.current = count;
    refresh();
  }, [count, refresh]);
}

export interface SpaceProviderProps {
  readonly api: SpaceApi;
  /** Cargas completadas en la pestaña: cada una nueva vuelve a pedir el resumen (CA-4, D-16). */
  readonly uploadedCount: number;
  readonly children: React.ReactNode;
}

/**
 * Una sola lectura del resumen para la tarjeta de la barra lateral, el `{máximo}` del explorador y `/espacio` (D-15).
 * Sin empuje en tiempo real (P-2): se refresca tras subir, mandar a la papelera, restaurar, purgar y vaciar.
 */
export function SpaceProvider({
  api,
  uploadedCount,
  children,
}: SpaceProviderProps): React.JSX.Element {
  const value = useSpaceSummary(api);
  useRefreshOnChange(uploadedCount, value.refresh);
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

/** El proveedor del layout de `(cliente)`: usa el cliente de `storage` y las cargas de la pestaña, sin tocar el manager. */
export function UploadsSpaceProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { api, uploadedFiles } = useUploads();
  return (
    <SpaceProvider api={api} uploadedCount={uploadedFiles.length}>
      {children}
    </SpaceProvider>
  );
}
