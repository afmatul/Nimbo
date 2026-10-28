import type { AccountListItem } from '@nimbo/contracts';
import type { JSX, ReactNode } from 'react';

import { ROLE_LABELS } from '../../access/role-labels';
import { dayText } from '../backoffice-dates';

import {
  AccountStatusBadge,
  isInternal,
  PlanValue,
  UsedSpaceValue,
  VerifiedValue,
} from './account-values';
import { ProfileCard } from './profile-card';

/** Aclaración bajo un dato («Cuenta interna»). */
export function Note({ children }: { readonly children: ReactNode }): JSX.Element {
  return <span className="block text-xs font-normal text-muted-foreground">{children}</span>;
}

export function Fact({
  term,
  children,
}: {
  readonly term: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="grid gap-1 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-3 sm:gap-3">
      <dt className="text-secondary-foreground">{term}</dt>
      <dd className="font-medium text-foreground sm:col-span-2">{children}</dd>
    </div>
  );
}

/** Plan y espacio de un cliente; en una interna, un solo «No aplica» con el motivo (mockup `propia-cuenta`). */
function UsageFacts({ account }: { readonly account: AccountListItem }): JSX.Element {
  if (isInternal(account)) {
    return (
      <Fact term="Plan y espacio">
        No aplica<Note>Las cuentas internas no guardan archivos.</Note>
      </Fact>
    );
  }
  return (
    <>
      <Fact term="Plan">
        <PlanValue account={account} />
      </Fact>
      <Fact term="Espacio usado">
        <UsedSpaceValue account={account} />
      </Fact>
    </>
  );
}

/** «Datos de la cuenta» (011 CA-1): solo datos de la cuenta y de su uso, sin archivos. */
export function AccountFacts({ account }: { readonly account: AccountListItem }): JSX.Element {
  return (
    <ProfileCard
      id="datos-cuenta"
      title="Datos de la cuenta"
      subtitle="Solo datos de la cuenta y de su uso; sin archivos."
    >
      <dl className="mt-3 text-sm">
        <Fact term="Rol">
          {ROLE_LABELS[account.role]}
          {isInternal(account) ? <Note>Cuenta interna</Note> : null}
        </Fact>
        <Fact term="Estado">
          <AccountStatusBadge status={account.status} />
        </Fact>
        <Fact term="Correo verificado">
          <VerifiedValue verified={account.emailVerified} />
        </Fact>
        <UsageFacts account={account} />
        <Fact term="Fecha de alta">
          <span className="tabular-nums">{dayText(account.createdAt)}</span>
        </Fact>
      </dl>
    </ProfileCard>
  );
}
