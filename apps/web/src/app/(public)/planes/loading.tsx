import type { ReactNode } from 'react';

import { StateView } from '../../../components/nimbo/state-view';

/** Estado «cargando» de la página de planes (008 §6) mientras el servidor lee el catálogo. */
export default function PlanesLoading(): ReactNode {
  return (
    <div className="p-6">
      <StateView type="loading" title="Cargando planes…" headingLevel="h2" />
    </div>
  );
}
