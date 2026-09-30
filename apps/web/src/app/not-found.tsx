import type { ReactNode } from 'react';

import { NotFoundState } from '../features/access/components/not-found-state';

/** 404 de rutas (003 §6.9). La raíz no tiene sesión, así que la acción es siempre «Ir al inicio». */
export default function NotFound(): ReactNode {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <NotFoundState />
    </main>
  );
}
