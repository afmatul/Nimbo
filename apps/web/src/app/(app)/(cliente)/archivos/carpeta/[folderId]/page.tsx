import type { ReactNode } from 'react';

import { MyFiles, returnFocusOf, type RouteSearch } from '../../../../../../features/storage';

interface CarpetaPageProps {
  readonly params: Promise<{ readonly folderId: string }>;
  readonly searchParams: Promise<RouteSearch>;
}

/**
 * Una carpeta con URL propia (006 CA-5): se puede compartir el enlace y volver con el navegador. Si no existe, es
 * ajena o está en la papelera, la vista muestra «No encontramos esta carpeta». Al volver de la vista previa, `?foco=`
 * indica la fila que recibe el foco (017 §6).
 */
export default async function CarpetaPage({
  params,
  searchParams,
}: CarpetaPageProps): Promise<ReactNode> {
  const [{ folderId }, search] = await Promise.all([params, searchParams]);
  return <MyFiles key={folderId} folderId={folderId} returnFocusId={returnFocusOf(search)} />;
}
