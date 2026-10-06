'use client';

import type { JSX } from 'react';

import { AccountMenu } from '../../../components/nimbo/account-menu';
import { useSession } from '../session/session-provider';

/** El `AccountMenu` con la cuenta de la sesión; al cerrarla, `SessionGate` lleva a iniciar sesión (CA-14). */
export function SessionAccountMenu(): JSX.Element | null {
  const { user, signOut } = useSession();
  if (user === null) return null;
  return <AccountMenu fullName={user.fullName} email={user.email} onSignOut={signOut} />;
}
