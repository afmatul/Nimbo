import type { ReactNode } from 'react';

import { AppLayout } from '../../../../components/nimbo/app-layout';
import { SignOutButton } from '../../../../features/identity/components/sign-out-button';
import { MyFiles } from '../../../../features/storage/components/my-files';

/**
 * Mis archivos (005): raíz con «Subir archivos», arrastrar y soltar y «Descargar». El panel de cargas vive en el layout
 * de `(cliente)`, así un fallo del listado no toca las cargas en curso.
 */
export default function ArchivosPage(): ReactNode {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        <MyFiles />
      </div>
    </AppLayout>
  );
}
