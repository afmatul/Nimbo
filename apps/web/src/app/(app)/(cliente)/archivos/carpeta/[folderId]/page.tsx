import type { ReactNode } from 'react';

import { MyFiles } from '../../../../../../features/storage/components/my-files';

interface CarpetaPageProps {
  readonly params: Promise<{ readonly folderId: string }>;
}

/**
 * Una carpeta con URL propia (006 CA-5): se puede compartir el enlace y volver con el navegador. Si no existe, es
 * ajena o está en la papelera, la vista muestra «No encontramos esta carpeta».
 */
export default async function CarpetaPage({ params }: CarpetaPageProps): Promise<ReactNode> {
  const { folderId } = await params;
  return <MyFiles key={folderId} folderId={folderId} />;
}
