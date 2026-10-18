import type { ReactNode } from 'react';

import { StateView } from '../../../../../components/nimbo/state-view';

/** Estado «cargando» de la pantalla de pago (009 §6) mientras el servidor lee el plan del catálogo. */
export default function ContratarLoading(): ReactNode {
  return (
    <div className="p-6">
      <StateView type="loading" title="Cargando el plan…" headingLevel="h2" />
    </div>
  );
}
