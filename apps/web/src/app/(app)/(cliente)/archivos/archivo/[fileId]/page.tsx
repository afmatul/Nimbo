import type { ReactNode } from 'react';

import { FileDetailView } from '../../../../../../features/storage/components/file-detail-view';

interface ArchivoPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
}

/**
 * Ficha de un archivo con su historial de versiones (014 D-10): una URL por archivo, hermana de la de cada carpeta. Si
 * el archivo no existe, es ajeno o está en la papelera, la vista muestra «No encontramos este archivo.».
 */
export default async function ArchivoPage({ params }: ArchivoPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  return <FileDetailView key={fileId} fileId={fileId} />;
}
