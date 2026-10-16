import type { ReactNode } from 'react';

import { returnFocusOf, type RouteSearch } from '../../../../features/storage';
import { PreviewFiles } from '../../../../features/storage/preview';

interface ArchivosPageProps {
  readonly searchParams: Promise<RouteSearch>;
}

/**
 * Mis archivos (005, 006): la raíz con sus carpetas, «Nueva carpeta», «Subir archivos», arrastrar y soltar,
 * «Descargar» y, en los formatos admitidos, «Previsualizar» (017). El panel de cargas vive en el layout de `(cliente)`,
 * así un fallo del listado no toca las cargas. Al volver de la vista previa, `?foco=` indica la fila que recibe el foco
 * (017 §6).
 */
export default async function ArchivosPage({
  searchParams,
}: ArchivosPageProps): Promise<ReactNode> {
  return <PreviewFiles folderId={null} returnFocusId={returnFocusOf(await searchParams)} />;
}
