import type { ReactNode } from 'react';

import { getEnv } from '../../../../../../env';
import { SessionFileDetailView } from '../../../../../../features/storage/components/session-file-detail-view';

interface ArchivoPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
}

/**
 * Ficha de un archivo con su historial de versiones (014 D-10) y su estado de indexación (019): una URL por archivo,
 * hermana de la de cada carpeta. Si el archivo no existe, es ajeno o está en la papelera, la vista muestra «No
 * encontramos este archivo.».
 */
export default async function ArchivoPage({ params }: ArchivoPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  return (
    <SessionFileDetailView key={fileId} apiPublicUrl={getEnv().API_PUBLIC_URL} fileId={fileId} />
  );
}
