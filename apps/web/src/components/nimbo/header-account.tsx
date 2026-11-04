'use client';

import * as React from 'react';

interface HeaderAccount {
  readonly account: React.ReactNode;
  /** Inicio del rol de la sesión, adonde lleva el logo; `/` fuera del grupo con sesión. */
  readonly homeHref: string;
}

const PUBLIC_HOME = '/';

const HeaderAccountContext = React.createContext<HeaderAccount>({
  account: null,
  homeHref: PUBLIC_HOME,
});

/**
 * La cuenta de la cabecera del `AppLayout` (p. ej. el `AccountMenu` de 002) y el inicio al que lleva el logo: los pone
 * el grupo de rutas con sesión, una sola vez, sin que cada página los pase ni que `components/nimbo` dependa de la sesión.
 */
export function HeaderAccountProvider({
  account,
  homeHref = PUBLIC_HOME,
  children,
}: {
  readonly account: React.ReactNode;
  readonly homeHref?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const value = React.useMemo(() => ({ account, homeHref }), [account, homeHref]);
  return <HeaderAccountContext.Provider value={value}>{children}</HeaderAccountContext.Provider>;
}

/** La cuenta que va en la cabecera, o `null` fuera del grupo con sesión. */
export function useHeaderAccount(): React.ReactNode {
  return React.useContext(HeaderAccountContext).account;
}

/** Adónde lleva el logo: el inicio del rol con sesión, o `/` sin ella. */
export function useHeaderHome(): string {
  return React.useContext(HeaderAccountContext).homeHref;
}
