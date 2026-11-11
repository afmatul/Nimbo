import type { ReactNode } from 'react';

import { getEnv } from '../../../../../../env';
import { StorageAppLayout } from '../../../../../../features/storage';
import { PreviewPage } from '../../../../../../features/storage/preview';

interface VistaPreviaPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
}

/**
 * Vista previa de un archivo (017), dentro del layout de la app (P-3): la URL solo identifica el archivo; el visor
 * reautoriza la entrega, muestra sus estados y «Volver» abre `file.folderId` (o la raíz) con el foco en la fila de
 * origen (plan §2.5).
 */
export default async function VistaPreviaPage({
  params,
}: VistaPreviaPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  return (
    <StorageAppLayout>
      <PreviewPage fileId={fileId} apiPublicUrl={getEnv().API_PUBLIC_URL} />
    </StorageAppLayout>
  );
}
