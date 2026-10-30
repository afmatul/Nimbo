import type { ReactNode } from 'react';

import { getEnv } from '../../../../../../env';
import { SessionFileDetailView } from '../../../../../../features/storage/components/session-file-detail-view';

interface ArchivoPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
  /** `ubicacion`: etiqueta de la cita que abrió la ficha (020b S-6). */
  readonly searchParams: Promise<{ readonly ubicacion?: string | string[] }>;
}

/**
 * Ficha de un archivo con su historial de versiones (014 D-10) y su estado de indexación (019): una URL por archivo,
 * hermana de la de cada carpeta. Si el archivo no existe, es ajeno o está en la papelera, la vista muestra «No
 * encontramos este archivo.», sin la ubicación citada (020b CA-12).
 */
export default async function ArchivoPage({
  params,
  searchParams,
}: ArchivoPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  const { ubicacion } = await searchParams;
  return (
    <SessionFileDetailView
      key={fileId}
      apiPublicUrl={getEnv().API_PUBLIC_URL}
      fileId={fileId}
      citedLocation={Array.isArray(ubicacion) ? ubicacion[0] : ubicacion}
    />
  );
}
