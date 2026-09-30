import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';

export interface ExplorerErrorStateProps {
  readonly onRetry: () => void;
}

/**
 * Fallo del listado: tranquiliza (los archivos siguen guardados) y ofrece repetir la petición, sin código de soporte.
 * «Reintentar» es `outline`: no borra nada (mockup `explorador--error`).
 */
export function ExplorerErrorState({ onRetry }: ExplorerErrorStateProps): React.JSX.Element {
  return (
    <StateView
      type="error"
      title="No pudimos cargar tus archivos."
      description="Tus archivos siguen guardados. Inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
    />
  );
}
