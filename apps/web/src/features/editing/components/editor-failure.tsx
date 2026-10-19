'use client';

import { EDITING_ERROR_CODES } from '@nimbo/contracts';
import { CloudOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { MY_FILES_LABEL, MY_FILES_PATH } from '../../storage/routes';

const STATE_CLASS = 'flex-1';

/**
 * El servicio de edición no responde (CA-15): el resto de Nimbo sigue funcionando y el archivo está intacto. Usa el
 * patrón existente de estados (spec §6).
 */
export function EditorUnavailableState({
  onRetry,
}: {
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="error"
      headingLevel="h2"
      icon={CloudOff}
      title="El editor no está disponible"
      description="Tus archivos siguen a salvo. Puedes seguir usando el resto de Nimbo mientras lo resolvemos; vuelve a intentarlo en unos minutos."
      action={{ label: 'Reintentar', onClick: onRetry, variant: 'default' }}
      className={STATE_CLASS}
    />
  );
}

/**
 * No se pudo abrir por otro código de la API: la sesión anterior se está guardando (409), el archivo no es `.docx`
 * (422, CA-4, no se ofrece «Editar») o un fallo inesperado. Cada uno con su acción correctiva (RNF-14).
 */
export function EditorFailedState({
  code,
  onRetry,
}: {
  readonly code: string | null;
  readonly onRetry: () => void;
}): React.JSX.Element {
  const router = useRouter();
  if (code === EDITING_ERROR_CODES.EDITING_UNSUPPORTED_FORMAT) {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="Solo se pueden editar documentos .docx"
        description="Este archivo no se puede abrir en el editor. Puedes descargarlo desde Mis archivos."
        action={{ label: `Volver a ${MY_FILES_LABEL}`, onClick: () => router.push(MY_FILES_PATH) }}
        className={STATE_CLASS}
      />
    );
  }
  return (
    <RetryableFailure
      saving={code === EDITING_ERROR_CODES.EDITING_SAVE_IN_PROGRESS}
      onRetry={onRetry}
    />
  );
}

function RetryableFailure({
  saving,
  onRetry,
}: {
  readonly saving: boolean;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="error"
      headingLevel="h2"
      title={saving ? 'Estamos guardando la sesión anterior' : 'No pudimos abrir el editor'}
      description={
        saving
          ? 'Inténtalo de nuevo en unos segundos para editar la versión recién guardada.'
          : 'Revisa tu conexión e inténtalo de nuevo.'
      }
      action={{ label: 'Reintentar', onClick: onRetry, variant: 'default' }}
      className={STATE_CLASS}
    />
  );
}
