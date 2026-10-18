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
 * Marcador del inicio de las cuentas internas (003 §6.9, CA-17) hasta que su área exista: hoy solo el Operador; se
 * retira en T-11 de 011, con /operacion/metricas. «Cerrar sesión» lo ofrece el menú de la cuenta del marco interno.
 */
export function InternalAreaPlaceholder({
  fullName,
  role,
}: InternalAreaPlaceholderProps): JSX.Element {
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      icon={ShieldCheck}
      title={`Hola, ${fullName}.`}
      description={`Tu área de ${ROLE_LABELS[role].toLowerCase()} estará disponible pronto.`}
    />
  );
}
