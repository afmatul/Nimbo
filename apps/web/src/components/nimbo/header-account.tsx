'use client';

import * as React from 'react';

const HeaderAccountContext = React.createContext<React.ReactNode>(null);

/**
 * La cuenta de la cabecera del `AppLayout` (p. ej. el `AccountMenu` de 002): la pone el grupo de rutas con sesión, una
 * sola vez, sin que cada página la pase ni que `components/nimbo` dependa de la sesión.
 */
export function HeaderAccountProvider({
  account,
  children,
}: {
  readonly account: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <HeaderAccountContext.Provider value={account}>{children}</HeaderAccountContext.Provider>;
}

/** La cuenta que va en la cabecera, o `null` fuera del grupo con sesión. */
export function useHeaderAccount(): React.ReactNode {
  return React.useContext(HeaderAccountContext);
}
