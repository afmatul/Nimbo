'use client';

import * as React from 'react';

import { SaveFailedAlert } from './save-failed-alert';

/**
 * Banner del estado `guardado-fallido` (CA-14): al volver a abrir un documento cuya última sesión no se guardó, se ve
 * antes que el editor, para que nadie crea que sus cambios están ahí. No se cierra: «Abrir el editor de nuevo» lo retira.
 */
export function SaveFailedBanner({
  onReopen,
}: {
  readonly onReopen: () => void;
}): React.JSX.Element {
  return (
    <SaveFailedAlert
      title="No pudimos guardar tus cambios."
      description="Tu versión anterior está intacta. Reintenta: abre el editor de nuevo para seguir desde esa versión."
      onReopen={onReopen}
    />
  );
}
