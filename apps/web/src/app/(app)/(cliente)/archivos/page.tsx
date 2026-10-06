import type { ReactNode } from 'react';

import { MyFiles } from '../../../../features/storage/components/my-files';

/**
 * Mis archivos (005, 006): la raíz con sus carpetas, «Nueva carpeta», «Subir archivos», arrastrar y soltar y
 * «Descargar». El panel de cargas vive en el layout de `(cliente)`, así un fallo del listado no toca las cargas.
 */
export default function ArchivosPage(): ReactNode {
  return <MyFiles folderId={null} />;
}
