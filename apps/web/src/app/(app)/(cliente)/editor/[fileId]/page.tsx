import type { ReactNode } from 'react';

import { getEnv } from '../../../../../env';
import { SessionEditorView } from '../../../../../features/editing/components/session-editor-view';

interface EditorPageProps {
  readonly params: Promise<{ readonly fileId: string }>;
}

/**
 * Editor `.docx` con presencia (spec 016): una URL por archivo, dentro de `(cliente)`, así que los roles internos no
 * llegan (CA-17). El script de ONLYOFFICE se carga desde el `documentServerUrl` que da la API.
 */
export default async function EditorPage({ params }: EditorPageProps): Promise<ReactNode> {
  const { fileId } = await params;
  return <SessionEditorView key={fileId} apiPublicUrl={getEnv().API_PUBLIC_URL} fileId={fileId} />;
}
