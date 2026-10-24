'use client';

import type { AccountListItem } from '@nimbo/contracts';
import { SearchX } from 'lucide-react';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { adminAccountPath } from '../../access/home-path';
import type { BackofficeApi } from '../api';
import { useAccount } from '../hooks/use-account';
import { useClientFiles, type LoadClientFiles } from '../hooks/use-client-files';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';

import { AccountLoadState } from './account-load-state';
import { ADMIN_PRIVACY } from './account-values';
import { BackLink } from './back-link';
import { ClientFilesLoading, ClientFilesOutcome } from './client-files-result';
import { PrivacyNotice } from './privacy-notice';

export type AdminClientFilesApi = Pick<BackofficeApi, 'getAccount' | 'listClientFiles'>;

/** Título, descripción y aviso de privacidad del Administrador (mockup `soporte--desde-admin`). */
function FilesHeader({ backLink }: { readonly backLink?: React.ReactNode }): React.JSX.Element {
  return (
    <>
      {backLink}
      <h1 className="mt-3 text-2xl font-semibold text-foreground">Metadatos de archivos</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Nombre, tipo, tamaño, fechas y estado de los archivos de esta cuenta.
      </p>
      <PrivacyNotice text={ADMIN_PRIVACY} />
    </>
  );
}

/** El mismo `404` de la API para una interna o un correo que ya no es de un cliente (003 D-6). */
function NotAClient({ email }: { readonly email: string }): React.JSX.Element {
  return (
    <StateView
      type="empty"
      role="status"
      headingLevel="h2"
      icon={SearchX}
      className="mt-4"
      title={`No encontramos una cuenta de cliente con «${email}».`}
      description="Las cuentas internas no guardan archivos. Vuelve a la ficha para revisar la cuenta."
    />
  );
}

interface FilesOfProps {
  readonly account: AccountListItem;
  readonly load: LoadClientFiles;
}

/** Los metadatos del cliente: el correo sale de su ficha, nunca de la URL (PD-101, RNF-17). Sin buscador. */
function FilesOf({ account, load }: FilesOfProps): React.JSX.Element {
  const files = useClientFiles(load, account.email);
  if (files.state.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  const backLink = (
    <BackLink
      href={adminAccountPath(account.id)}
      label={`Volver a la ficha de ${account.fullName}`}
    />
  );
  return (
    <div className="mx-auto w-full max-w-6xl">
      <FilesHeader backLink={backLink} />
      {files.state.status === 'notFound' ? (
        <NotAClient email={files.state.email} />
      ) : (
        <ClientFilesOutcome files={files} viewer="ADMIN" />
      )}
    </div>
  );
}

/**
 * Metadatos de los archivos de un cliente desde su ficha (011 CA-13, estado `desde-admin`): la vista de Soporte sin
 * buscador, con «Volver a la ficha» y el rol de la sesión (Administrador) en los avisos. La URL lleva solo el id.
 */
export function AdminClientFiles({
  accountId,
  api,
}: {
  readonly accountId: string;
  readonly api: AdminClientFilesApi;
}): React.JSX.Element {
  const account = useAccount(api.getAccount, accountId);
  if (account.state.status === 'ready') {
    return <FilesOf account={account.state.account} load={api.listClientFiles} />;
  }
  return (
    <div className="mx-auto w-full max-w-6xl">
      {account.state.status === 'loading' ? (
        <>
          <FilesHeader />
          <ClientFilesLoading />
        </>
      ) : (
        <AccountLoadState account={account} />
      )}
    </div>
  );
}

/** La vista conectada a la API con la sesión en memoria (002). */
export function SessionAdminClientFiles({
  apiPublicUrl,
  accountId,
}: {
  readonly apiPublicUrl: string;
  readonly accountId: string;
}): React.JSX.Element {
  return <AdminClientFiles accountId={accountId} api={useSessionBackofficeApi(apiPublicUrl)} />;
}
