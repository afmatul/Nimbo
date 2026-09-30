import type { RoleName } from '@nimbo/contracts';
import { ShieldCheck } from 'lucide-react';
import type { JSX } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ROLE_LABELS } from '../role-labels';

export interface InternalAreaPlaceholderProps {
  readonly fullName: string;
  readonly role: RoleName;
  /** Acción «Cerrar sesión»; la conecta la página con la sesión de 002. */
  readonly onLogout: () => void;
}

/** Marcador del inicio de las cuentas internas (003 §6.9, CA-17) hasta que su área exista. */
export function InternalAreaPlaceholder({
  fullName,
  role,
  onLogout,
}: InternalAreaPlaceholderProps): JSX.Element {
  return (
    <StateView
      type="empty"
      icon={ShieldCheck}
      title={`Hola, ${fullName}.`}
      description={`Tu área de ${ROLE_LABELS[role].toLowerCase()} estará disponible pronto.`}
      action={{ label: 'Cerrar sesión', onClick: onLogout, variant: 'outline' }}
    />
  );
}
