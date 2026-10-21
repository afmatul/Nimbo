'use client';

import { SearchX, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { buttonVariants } from '../../../components/ui/button';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { INTERNAL_PATHS } from '../../access/home-path';
import { useAccounts, type Accounts, type LoadAccounts } from '../hooks/use-accounts';
import { useResetWithFocus } from '../hooks/use-reset-with-focus';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';

import { AccountSearch } from './account-search';
import { ADMIN_PRIVACY } from './account-values';
import { AccountsTable } from './accounts-table';
import { LoadingStatus, SkeletonLine } from './loading';
import { PagePager } from './page-pager';
import { PrivacyNotice } from './privacy-notice';

/** Filas del esqueleto; distintas entre sí: sirven de `key`. */
const SKELETON_ROWS = ['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5', 'w-4/5'];

/** Esqueleto de la tabla (oculto a lectores) y el estado anunciado (mockup `cargando`). */
function AccountsLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="mt-4">
      <div aria-hidden="true" className="rounded-lg border border-border bg-card">
        {SKELETON_ROWS.map((width) => (
          <div key={width} className="border-b border-border p-3.5 last:border-b-0">
            <SkeletonLine className={width} />
          </div>
        ))}
      </div>
      <LoadingStatus text="Cargando cuentas…" />
    </div>
  );
}

type ReadyState = Extract<Accounts['state'], { status: 'ready' }>;

/** Nada coincide con la búsqueda (mockup `vacio`): «Limpiar búsqueda» vuelve a la lista completa. */
function NoMatches({
  email,
  onClear,
}: {
  readonly email: string;
  readonly onClear: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="empty"
      role="status"
      headingLevel="h2"
      icon={SearchX}
      className="mt-4"
      title={`No encontramos ninguna cuenta con «${email}».`}
      description="Revisa que el correo esté bien escrito o vuelve a la lista completa."
      action={{ label: 'Limpiar búsqueda', onClick: onClear, variant: 'outline' }}
    />
  );
}

function AccountsPage({
  accounts,
  ready,
}: {
  readonly accounts: Accounts;
  readonly ready: ReadyState;
}) {
  const { items, page, pageSize, total } = ready.result;
  return (
    <div aria-busy={ready.paging || undefined}>
      <AccountsTable items={items} />
      <PagePager
        label="Paginación de cuentas"
        noun="cuentas"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={accounts.goToPage}
      />
    </div>
  );
}

interface OutcomeProps {
  readonly accounts: Accounts;
  readonly onClear: () => void;
}

/** Cargando, error con «Reintentar», vacío o la página de cuentas (011 CA-1, CA-17). */
function AccountsOutcome({ accounts, onClear }: OutcomeProps): React.ReactNode {
  const { state } = accounts;
  if (state.status === 'loading') return <AccountsLoading />;
  if (state.status === 'ready') {
    // Sin búsqueda la lista nunca está vacía: trae al menos la cuenta del Administrador que consulta.
    if (state.result.total === 0 && state.email !== undefined) {
      return <NoMatches email={state.email} onClear={onClear} />;
    }
    return <AccountsPage accounts={accounts} ready={state} />;
  }
  if (state.status !== 'error') return null;
  return (
    <StateView
      type="error"
      headingLevel="h2"
      className="mt-4"
      title="No pudimos cargar las cuentas."
      description="Ninguna cuenta cambió. Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: accounts.retry, variant: 'outline' }}
    />
  );
}

function AccountsHeader(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Cuentas</h1>
        <p className="mt-1 text-sm text-secondary-foreground">
          Clientes y cuentas internas. Abre una ficha para suspenderla o reactivarla.
        </p>
      </div>
      <Link href={INTERNAL_PATHS.adminNewAccount} className={buttonVariants()}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Nueva cuenta interna
      </Link>
    </div>
  );
}

/**
 * Cuentas para el Administrador (011 HU-1, CA-1, CA-17; mockup `backoffice/admin`): lista paginada de clientes e
 * internas, búsqueda por el inicio del correo y acceso a cada ficha y al alta interna.
 */
export function AdminAccounts({ load }: { readonly load: LoadAccounts }): React.JSX.Element {
  const accounts = useAccounts(load);
  const search = useResetWithFocus(() => accounts.search(undefined));
  if (accounts.state.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <AccountsHeader />
      <PrivacyNotice text={ADMIN_PRIVACY} />
      <AccountSearch key={search.formKey} onSearch={accounts.search} inputRef={search.inputRef} />
      <AccountsOutcome accounts={accounts} onClear={search.reset} />
    </div>
  );
}

/** La lista conectada a la API con la sesión en memoria (002). */
export function SessionAdminAccounts({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <AdminAccounts load={useSessionBackofficeApi(apiPublicUrl).listAccounts} />;
}
