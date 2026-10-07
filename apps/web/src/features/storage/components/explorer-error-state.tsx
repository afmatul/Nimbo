import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';

export interface ExplorerErrorStateProps {
  /** «No pudimos cargar tus archivos.» en la raíz; «No pudimos abrir esta carpeta.» en una carpeta (006). */
  readonly title: string;
  readonly onRetry: () => void;
}

/**
 * Fallo del listado: tranquiliza (los archivos siguen guardados) y ofrece repetir la petición, sin código de soporte.
 * «Reintentar» es `outline`: no borra nada (mockup `explorador--error`).
 */
export function ExplorerErrorState({ title, onRetry }: ExplorerErrorStateProps): React.JSX.Element {
  return (
    <StateView
      type="error"
      headingLevel="h2"
      title={title}
      description="Tus archivos siguen guardados. Inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
    />
  );
}
