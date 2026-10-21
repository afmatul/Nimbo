'use client';

import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import * as React from 'react';

import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { Alert } from '../../../components/ui/alert';
import { messageForCode } from '../../../lib/error-catalog';
import { RENEW_PATH } from '../../billing/routes';

import { useReadOnlyAccount } from './space-provider';

/** CA-13: lo que no se puede hacer en solo lectura, para el texto junto a las acciones deshabilitadas (CA-14). */
export const READ_ONLY_ACTIONS_HINT =
  'Tu cuenta está en solo lectura: no puedes subir, crear, renombrar, mover ni restaurar.';

/**
 * El aviso de solo lectura del explorador, la papelera y la ficha del archivo (spec 010 CA-14; mockup
 * `shared/layout/layout--solo-lectura`). Nada si la cuenta está vigente.
 */
export function ReadOnlyNotice(): React.JSX.Element | null {
  const { readOnly, planName } = useReadOnlyAccount();
  if (!readOnly) return null;
  const plan = planName === null ? 'Tu plan' : `Tu plan ${planName}`;
  return (
    <ReadOnlyBanner
      title="Tu cuenta está en solo lectura."
      description={`${plan} venció. Tus archivos siguen aquí: puedes verlos y descargarlos, pero no subir ni editar hasta que renueves.`}
      renewHref={RENEW_PATH}
    />
  );
}

/** Lo que el explorador necesita de la solo lectura para sus cargas (spec 010 CA-14). */
export interface ReadOnlyUploads {
  readonly readOnly: boolean;
  /** Se soltaron archivos en solo lectura: se muestra el mensaje de CA-13 y no se cargan. */
  readonly blockedDrop: boolean;
  readonly onFiles: (files: readonly File[]) => void;
}

/**
 * En solo lectura, soltar o elegir archivos no los carga: muestra el mensaje de `STORAGE_ACCOUNT_READ_ONLY`. El
 * mensaje se borra al cambiar de carpeta (`placeKey`).
 */
export function useReadOnlyUploads(
  onFiles: (files: readonly File[]) => void,
  placeKey: string | null,
): ReadOnlyUploads {
  const { readOnly } = useReadOnlyAccount();
  const [blockedIn, setBlockedIn] = React.useState<{ readonly place: string | null } | null>(null);
  const blockedDrop = blockedIn !== null && blockedIn.place === placeKey;
  const block = (): void => setBlockedIn({ place: placeKey });
  return { readOnly, blockedDrop, onFiles: readOnly ? block : onFiles };
}

/** CA-14: la explicación en texto de las acciones deshabilitadas (explorador, papelera y ficha). Nada si está vigente. */
export function ReadOnlyActionsHint(): React.JSX.Element | null {
  const { readOnly } = useReadOnlyAccount();
  if (!readOnly) return null;
  return <p className="text-sm text-secondary-foreground">{READ_ONLY_ACTIONS_HINT}</p>;
}

/** El texto junto a las acciones deshabilitadas y, si se soltaron archivos, el mensaje de CA-13 (CA-14). */
export function ReadOnlyUploadFeedback({
  readOnly,
  blockedDrop,
}: Omit<ReadOnlyUploads, 'onFiles'>): React.JSX.Element | null {
  if (!readOnly) return null;
  return (
    <>
      <ReadOnlyActionsHint />
      {blockedDrop ? (
        <Alert variant="error">
          {messageForCode(STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY)}
        </Alert>
      ) : null}
    </>
  );
}
