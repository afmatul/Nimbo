import type { AccountListItem } from '@nimbo/contracts';
import Link from 'next/link';
import type { JSX } from 'react';

import { adminAccountPath } from '../../access/home-path';
import { ROLE_LABELS } from '../../access/role-labels';
import { dayText } from '../backoffice-dates';

import {
  AccountStatusBadge,
  isInternal,
  planLabel,
  PlanValue,
  SelfTag,
  UsedSpaceValue,
  VerifiedValue,
} from './account-values';

/** Desde `lg` cada dato en su columna; antes, apilados bajo el nombre (decisión 6). */
const WIDE = 'hidden lg:table-cell';
const CELL = 'px-3.5 py-3 align-middle';
const HEAD =
  'px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const COLUMNS = ['Rol', 'Estado', 'Verificada', 'Plan', 'Espacio usado', 'Alta'] as const;

/** Rol, verificación, plan con espacio (o «Cuenta interna») y alta, apilados para anchos menores. */
function StackedFacts({ account }: { readonly account: AccountListItem }): JSX.Element {
  const usage = isInternal(account)
    ? `Cuenta interna · alta: ${dayText(account.createdAt)}`
    : `Alta: ${dayText(account.createdAt)}`;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary-foreground lg:hidden">
      <AccountStatusBadge status={account.status} />
      <span>{ROLE_LABELS[account.role]}</span>
      <span>{account.emailVerified ? 'Correo verificado' : 'Correo sin verificar'}</span>
      {isInternal(account) ? null : (
        <span>
          <span>{planLabel(account)}</span>
          {' · '}
          <UsedSpaceValue account={account} />
        </span>
      )}
      <span className="w-full tabular-nums">{usage}</span>
    </div>
  );
}

/** Nombre (enlace a la ficha por id), «TÚ», correo y, en anchos menores, los demás datos. */
function AccountCell({ account }: { readonly account: AccountListItem }): JSX.Element {
  return (
    <td className={CELL}>
      <Link
        href={adminAccountPath(account.id)}
        className="inline-flex min-h-6 items-center rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {account.fullName}
      </Link>
      {account.isSelf ? <SelfTag /> : null}
      <span className="block break-all text-xs text-secondary-foreground">{account.email}</span>
      <StackedFacts account={account} />
    </td>
  );
}

function AccountRow({ account }: { readonly account: AccountListItem }): JSX.Element {
  return (
    <tr className="border-b border-border last:border-b-0">
      <AccountCell account={account} />
      <td className={`${CELL} ${WIDE}`}>{ROLE_LABELS[account.role]}</td>
      <td className={`${CELL} ${WIDE}`}>
        <AccountStatusBadge status={account.status} />
      </td>
      <td className={`${CELL} ${WIDE}`}>
        <VerifiedValue verified={account.emailVerified} />
      </td>
      <td className={`${CELL} ${WIDE}`}>
        <PlanValue account={account} />
      </td>
      <td className={`${CELL} ${WIDE} whitespace-nowrap`}>
        <UsedSpaceValue account={account} />
      </td>
      <td className={`${CELL} ${WIDE} whitespace-nowrap tabular-nums`}>
        {dayText(account.createdAt)}
      </td>
    </tr>
  );
}

/** Encabezados solo desde `lg`: antes, cada fila apila sus datos. */
function AccountsHead(): JSX.Element {
  return (
    <thead className="hidden border-b border-border bg-background lg:table-header-group">
      <tr>
        {['Cuenta', ...COLUMNS].map((column) => (
          <th key={column} scope="col" className={HEAD}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Cuentas de la página (011 CA-1; mockup `backoffice/admin`): clientes e internas en el orden de la API (alta más
 * reciente primero), sin datos de archivos. El nombre abre la ficha.
 */
export function AccountsTable({
  items,
}: {
  readonly items: readonly AccountListItem[];
}): JSX.Element {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <table className="w-full border-collapse text-sm text-secondary-foreground">
        <caption className="sr-only">
          Cuentas, ordenadas por fecha de alta, de la más reciente
        </caption>
        <AccountsHead />
        <tbody>
          {items.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
