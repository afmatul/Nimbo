'use client';

import type { ReactNode } from 'react';

import { CLIENT_ROLES } from '../../features/access/home-path';
import { useSession } from '../../features/identity/session/session-provider';
import { SessionAgentProvider } from '../../features/intelligence/components/session-agent-provider';
import { UploadsSpaceProvider } from '../../features/storage/components/space-provider';
import { SessionUploadsProvider } from '../../features/storage/components/uploads-provider';

interface ClientProvidersProps {
  readonly apiPublicUrl: string;
  readonly children: ReactNode;
}

/**
 * Lo que comparte cada pantalla del Cliente: las cargas (RN-7, plan 005 §6), el resumen de espacio (007 D-15) y la
 * sesión del agente con su panel (020b CA-17). Así la barra lateral es la misma en todas sus pantallas.
 */
export function ClientProviders({ apiPublicUrl, children }: ClientProvidersProps): ReactNode {
  return (
    <SessionUploadsProvider apiPublicUrl={apiPublicUrl}>
      <SessionAgentProvider apiPublicUrl={apiPublicUrl}>
        <UploadsSpaceProvider>{children}</UploadsSpaceProvider>
      </SessionAgentProvider>
    </SessionUploadsProvider>
  );
}

/** Para rutas de todos los roles (Seguridad): monta lo del Cliente solo si la sesión es de un cliente (CA-18). */
export function ClientProvidersForClientRole({
  apiPublicUrl,
  children,
}: ClientProvidersProps): ReactNode {
  const { user } = useSession();
  if (user === null || !CLIENT_ROLES.includes(user.role)) return children;
  return <ClientProviders apiPublicUrl={apiPublicUrl}>{children}</ClientProviders>;
}
