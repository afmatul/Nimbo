import type { RoleName } from '@nimbo/contracts';
import { ShieldCheck } from 'lucide-react';
import type { JSX } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ROLE_LABELS } from '../role-labels';

export interface InternalAreaPlaceholderProps {
  readonly fullName: string;
  readonly role: RoleName;
}

/**
 * Marcador del inicio de las cuentas internas (003 §6.9, CA-17) hasta que su área exista. «Cerrar sesión» lo pone la
 * página con el `SignOutButton` de 002, que muestra la carga y no repite el cierre.
 */
export function InternalAreaPlaceholder({
  fullName,
  role,
}: InternalAreaPlaceholderProps): JSX.Element {
  return (
    <StateView
      type="empty"
      icon={ShieldCheck}
      title={`Hola, ${fullName}.`}
      description={`Tu área de ${ROLE_LABELS[role].toLowerCase()} estará disponible pronto.`}
    />
  );
}
