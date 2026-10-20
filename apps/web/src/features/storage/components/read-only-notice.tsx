'use client';

import type * as React from 'react';

import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
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
