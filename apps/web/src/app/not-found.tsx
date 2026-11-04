import type { ReactNode } from 'react';

import { FocusedLayout } from '../components/nimbo/focused-layout';
import { NotFoundState } from '../features/access/components/not-found-state';

/** 404 de rutas (003 §6.9), con el logo de Nimbo. La raíz no tiene sesión, así que la acción es siempre «Ir al inicio». */
export default function NotFound(): ReactNode {
  return (
    <FocusedLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <NotFoundState />
      </div>
    </FocusedLayout>
  );
}
