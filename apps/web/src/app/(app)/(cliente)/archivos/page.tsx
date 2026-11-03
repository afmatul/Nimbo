import type { ReactNode } from 'react';

import { getEnv } from '../../../../env';
import { SessionMyFiles } from '../../../../features/storage/components/session-my-files';

/**
 * Mis archivos (005, 006): la raíz con sus carpetas, «Nueva carpeta», «Subir archivos», arrastrar y soltar,
 * «Descargar» y «Compartir» (012b). El panel de cargas vive en el layout de `(cliente)`, así un fallo del listado no
 * toca las cargas.
 */
export default function ArchivosPage(): ReactNode {
  return <SessionMyFiles apiPublicUrl={getEnv().API_PUBLIC_URL} folderId={null} />;
}
