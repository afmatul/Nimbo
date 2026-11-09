'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { InternalAreaLayout } from '../../access/components/internal-area-layout';
import { CLIENT_ROLES } from '../../access/home-path';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useSpace } from '../../storage/components/space-provider';
import { useSessionsActions } from '../hooks/use-sessions-actions';
import { useSession } from '../session/session-provider';
import { useAuthFetch } from '../session/use-auth-fetch';

import { ChangePasswordForm } from './change-password-form';
import { SessionsCard } from './sessions-card';

/** «Seguridad» no tiene entrada en la barra lateral (D-16): ninguna queda activa. */
const NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({ ...item, active: false }));

/** La tarjeta de espacio al pie de la barra, como en el resto de las pantallas del cliente. */
function ClientQuota(): JSX.Element {
  return <SidebarQuota state={useSpace().state} />;
}

/**
 * Marco de cada rol: el cliente ve la página dentro de su `AppLayout`, con la misma barra lateral
 * (Agente Nimbo y espacio) que en sus otras pantallas; los roles internos, dentro del marco de su área
 * (011 CA-17, B-1), sin ninguna entrada activa.
 */
function SecurityFrame({ children }: { readonly children: ReactNode }): JSX.Element | null {
  const { user } = useSession();
  if (user === null) return null;
  if (CLIENT_ROLES.includes(user.role)) {
    return (
      <AppLayout navItems={NAV_ITEMS} quotaCard={<ClientQuota />}>
        {children}
      </AppLayout>
    );
  }
  return <InternalAreaLayout>{children}</InternalAreaLayout>;
}

/**
 * «Seguridad» (spec 002 §11, mockup `identity/seguridad`, CA-11 a CA-14, CA-22, CA-23): las sesiones abiertas y el
 * cambio de contraseña, que al terminar vuelve a pedir la lista (cierra las demás sesiones, D-7).
 */
export function SecurityView({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const authFetch = useAuthFetch();
  const actions = useSessionsActions(apiPublicUrl, authFetch);
  const [listVersion, setListVersion] = useState(0);
  return (
    <SecurityFrame>
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Seguridad</h1>
        <p className="text-sm text-secondary-foreground">
          Revisa dónde está abierta tu cuenta y cambia tu contraseña.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SessionsCard key={listVersion} actions={actions} />
        <ChangePasswordForm
          apiPublicUrl={apiPublicUrl}
          authFetch={authFetch}
          onChanged={() => setListVersion((previous) => previous + 1)}
        />
      </div>
    </SecurityFrame>
  );
}
