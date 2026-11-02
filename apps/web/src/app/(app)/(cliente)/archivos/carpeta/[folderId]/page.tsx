import type { ReactNode } from 'react';

import { getEnv } from '../../../../../../env';
import { SessionMyFiles } from '../../../../../../features/storage/components/session-my-files';

interface CarpetaPageProps {
  readonly params: Promise<{ readonly folderId: string }>;
}

/**
 * Una carpeta con URL propia (006 CA-5): se puede compartir el enlace y volver con el navegador. Si no existe, es
 * ajena o está en la papelera, la vista muestra «No encontramos esta carpeta». Si está compartida conmigo, sin
 * escrituras y con las migas desde ella (012b CA-9).
 */
export default async function CarpetaPage({ params }: CarpetaPageProps): Promise<ReactNode> {
  const { folderId } = await params;
  return (
    <SessionMyFiles key={folderId} apiPublicUrl={getEnv().API_PUBLIC_URL} folderId={folderId} />
  );
}
