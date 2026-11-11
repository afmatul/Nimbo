import type { ReactNode } from 'react';

import { getEnv } from '../../../../../../env';
import { returnFocusOf, type RouteSearch } from '../../../../../../features/storage';
import { PreviewFiles } from '../../../../../../features/storage/preview';

interface CarpetaPageProps {
  readonly params: Promise<{ readonly folderId: string }>;
  readonly searchParams: Promise<RouteSearch>;
}

/**
 * Una carpeta con URL propia (006 CA-5): se puede compartir el enlace y volver con el navegador. Si no existe, es
 * ajena o está en la papelera, la vista muestra «No encontramos esta carpeta». Si está compartida conmigo, sin
 * escrituras y con las migas desde ella (012b CA-9). Sus archivos ofrecen «Previsualizar» (017) y, al volver de la
 * vista previa, `?foco=` indica la fila que recibe el foco (017 §6).
 */
export default async function CarpetaPage({
  params,
  searchParams,
}: CarpetaPageProps): Promise<ReactNode> {
  const [{ folderId }, search] = await Promise.all([params, searchParams]);
  return (
    <PreviewFiles
      key={folderId}
      apiPublicUrl={getEnv().API_PUBLIC_URL}
      folderId={folderId}
      returnFocusId={returnFocusOf(search)}
    />
  );
}
