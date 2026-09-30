import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { StateView } from '../../../../components/nimbo/state-view';
import { SignOutButton } from '../../../../features/identity/components/sign-out-button';

/** Marcador del área interna (inicio de ADMIN, SUPPORT y OPERATOR) hasta que 003 y 011 la construyan. */
export default function InternoPage(): ReactNode {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Área interna</h1>
        <SignOutButton />
      </div>
      <StateView
        type="empty"
        icon={ShieldCheck}
        title="El área interna estará disponible pronto"
        description="Aquí verás las herramientas de administración, soporte y operación de Nimbo."
      />
    </main>
  );
}
