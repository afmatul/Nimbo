'use client';

import type { JSX, ReactNode } from 'react';

import { HeaderAccountProvider } from '../../../components/nimbo/header-account';
import { homePathFor } from '../../access/home-path';
import { useSession } from '../session/session-provider';

import { SessionAccountMenu } from './session-account-menu';

/**
 * Cabecera del grupo con sesión (CA-14): el menú de la cuenta, único lugar para cerrar la sesión en las pantallas, y el
 * logo que lleva al inicio del rol (Mis archivos o el área interna, 003 D-5) en vez de a la página de estado.
 */
export function SessionHeaderProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { user } = useSession();
  return (
    <HeaderAccountProvider
      account={<SessionAccountMenu />}
      {...(user === null ? {} : { homeHref: homePathFor(user.role) })}
    >
      {children}
    </HeaderAccountProvider>
  );
}
