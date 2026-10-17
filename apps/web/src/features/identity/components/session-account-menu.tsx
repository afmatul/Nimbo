'use client';

import type { JSX } from 'react';

import { AccountMenu } from '../../../components/nimbo/account-menu';
import { activityPathFor } from '../../access/home-path';
import { useSession } from '../session/session-provider';

/**
 * El `AccountMenu` con la cuenta de la sesión; al cerrarla, `SessionGate` lleva a iniciar sesión (CA-14). «Mi actividad»
 * abre la del rol: la del cliente o la del marco interno (011 CA-17).
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
    />
  );
}
