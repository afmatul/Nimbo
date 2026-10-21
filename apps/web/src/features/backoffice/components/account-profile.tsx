'use client';

import type { AccountListItem } from '@nimbo/contracts';
import { CheckCircle2 } from 'lucide-react';
import type * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import type { BackofficeApi } from '../api';
import { useAccount } from '../hooks/use-account';
import { useAccountStatus, type AccountStatusActions } from '../hooks/use-account-status';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';

import { AccountActions } from './account-actions';
import { AccountFacts } from './account-facts';
import { AccountLoadState } from './account-load-state';
import { AccountStatusDialogs } from './account-status-dialogs';
import {
  ADMIN_PRIVACY,
  AccountStatusBadge,
  isInternal,
  RoleBadge,
  SelfTag,
} from './account-values';
import { BackLink } from './back-link';
import { PrivacyNotice } from './privacy-notice';

export type AccountProfileApi = Pick<
  BackofficeApi,
  'getAccount' | 'suspendAccount' | 'reactivateAccount'
>;

/** Avisos de éxito (decisión 8): qué cambió y qué pasa ahora; comparticiones y enlaces solo en clientes (RN-6). */
const DONE_TEXTS = {
  suspend: {
    title: 'Esta cuenta quedó suspendida y se cerraron sus sesiones.',
    client:
      'Sus comparticiones y enlaces públicos están en pausa hasta que la reactives. No se borró nada.',
    internal: 'No podrá iniciar sesión hasta que la reactives. No se borró nada.',
  },
  reactivate: {
    title: 'Esta cuenta quedó activa de nuevo.',
    client: 'Puede iniciar sesión otra vez y sus comparticiones y enlaces vuelven como estaban.',
    internal: 'Puede iniciar sesión otra vez.',
  },
} as const;

interface ProfileProps {
  readonly account: AccountListItem;
  readonly status: AccountStatusActions;
}

/** El resultado del último cambio: éxito (`role="status"`) o el motivo del rechazo, sin que nada cambie (CA-4). */
function StatusNotice({ account, status }: ProfileProps): React.ReactNode {
  if (status.failure !== null) {
    return (
      <div className="mt-4">
        <ServerErrorAlert title="No cambiamos el estado de la cuenta." error={status.failure} />
      </div>
    );
  }
  if (status.done === null) return null;
  const texts = DONE_TEXTS[status.done];
  return (
    <Alert variant="success" className="mt-4 flex items-start gap-2.5">
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold">{texts.title}</p>
        <p className="text-secondary-foreground">
          {texts[isInternal(account) ? 'internal' : 'client']}
        </p>
      </div>
    </Alert>
  );
}

function ProfileHeader({ account }: { readonly account: AccountListItem }): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-foreground">
          {account.fullName}
          {account.isSelf ? <SelfTag /> : null}
        </h1>
        <p className="break-all text-sm text-secondary-foreground">{account.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <AccountStatusBadge status={account.status} />
        <RoleBadge role={account.role} />
      </div>
    </div>
  );
}

interface ProfileViewProps {
  readonly account: AccountListItem;
  readonly api: AccountProfileApi;
  readonly onChanged: (account: AccountListItem) => void;
}

function ProfileView({ account, api, onChanged }: ProfileViewProps): React.JSX.Element {
  const status = useAccountStatus({ api, account, onChanged });
  if (status.forbidden) return <ForbiddenState role="ADMIN" />;
  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink href={INTERNAL_PATHS.adminAccounts} label="Volver a cuentas" />
      <ProfileHeader account={account} />
      <StatusNotice account={account} status={status} />
      <PrivacyNotice text={ADMIN_PRIVACY} />
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <AccountFacts account={account} />
        <AccountActions account={account} status={status} />
      </div>
      <AccountStatusDialogs account={account} status={status} />
    </div>
  );
}

/**
 * Ficha de una cuenta para el Administrador (011 CA-1 a CA-4, CA-17; mockup `backoffice/admin`): sus datos sin
 * archivos, suspender o reactivar con confirmación y, en clientes, el acceso a sus metadatos.
 */
export function AccountProfile({
  accountId,
  api,
}: {
  readonly accountId: string;
  readonly api: AccountProfileApi;
}): React.ReactNode {
  const account = useAccount(api.getAccount, accountId);
  if (account.state.status !== 'ready') return <AccountLoadState account={account} />;
  return <ProfileView account={account.state.account} api={api} onChanged={account.replace} />;
}

/** La ficha conectada a la API con la sesión en memoria (002). */
export function SessionAccountProfile({
  apiPublicUrl,
  accountId,
}: {
  readonly apiPublicUrl: string;
  readonly accountId: string;
}): React.ReactNode {
  return <AccountProfile accountId={accountId} api={useSessionBackofficeApi(apiPublicUrl)} />;
}
