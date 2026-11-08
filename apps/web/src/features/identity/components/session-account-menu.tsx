'use client';

import type { JSX } from 'react';

import { AccountMenu } from '../../../components/nimbo/account-menu';
import { activityPathFor, CLIENT_ROLES } from '../../access/home-path';
import { ROLE_LABELS } from '../../access/role-labels';
import { PLAN_AND_BILLING_PATH } from '../../billing';
import { useSession } from '../session/session-provider';

/**
 * El `AccountMenu` con la cuenta de la sesión; al cerrarla, `SessionGate` lleva a iniciar sesión (CA-14). «Mi actividad»
 * abre la del rol: la del cliente o la del marco interno (011 CA-17). «Plan y facturación» (009) solo para clientes: las
 * cuentas internas no tienen suscripción; ellas ven su rol bajo el correo.
 */
export function SessionAccountMenu(): JSX.Element | null {
  const { user, signOut } = useSession();
  if (user === null) return null;
  return (
    <AccountMenu
      fullName={user.fullName}
      email={user.email}
      onSignOut={signOut}
      activityHref={activityPathFor(user.role)}
      {...(CLIENT_ROLES.includes(user.role)
        ? { billingHref: PLAN_AND_BILLING_PATH }
        : { roleLabel: ROLE_LABELS[user.role] })}
    />
  );
}
