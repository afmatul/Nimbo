'use client';

import { UserX } from 'lucide-react';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import type { Account } from '../hooks/use-account';

import { BackLink } from './back-link';

function AccountNotFound(): React.JSX.Element {
  return (
    <div>
      <BackLink href={INTERNAL_PATHS.adminAccounts} label="Volver a cuentas" />
      <StateView
        type="empty"
        headingLevel="h2"
        icon={UserX}
        className="mt-4"
        title="No encontramos esta cuenta."
        description="Puede que el enlace esté incompleto. Vuelve a Cuentas y búscala por su correo."
      />
    </div>
  );
}

/**
 * Lo que se ve mientras la cuenta no está lista (011 CA-17), en la ficha y en sus metadatos: cargando, no encontrada
 * (con «Volver a cuentas»), error con «Reintentar» o la pantalla común «sin permiso» (CA-14).
 */
export function AccountLoadState({ account }: { readonly account: Account }): React.ReactNode {
  const { state } = account;
  if (state.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  if (state.status === 'loading') {
    return <StateView type="loading" headingLevel="h2" title="Cargando la cuenta…" />;
  }
  if (state.status === 'notFound') return <AccountNotFound />;
  return (
    <StateView
      type="error"
      headingLevel="h2"
      title="No pudimos cargar la cuenta."
      description="Ninguna cuenta cambió. Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: account.retry, variant: 'outline' }}
    />
  );
}
