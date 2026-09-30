import type { ReactNode } from 'react';

import { AppLayout } from '../../../../components/nimbo/app-layout';
import { StateView } from '../../../../components/nimbo/state-view';
import { SignOutButton } from '../../../../features/identity/components/sign-out-button';

/** Marcador de Mis archivos (destino de CA-1) hasta que 005/006 construyan la página real. */
export default function ArchivosPage(): ReactNode {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-foreground">Mis archivos</h1>
          <SignOutButton />
        </div>
        <StateView
          type="empty"
          title="Tus archivos aparecerán aquí"
          description="Muy pronto podrás subir, ordenar y descargar tus archivos desde esta página."
        />
      </div>
    </AppLayout>
  );
}
