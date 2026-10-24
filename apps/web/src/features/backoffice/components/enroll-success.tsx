'use client';

import type { AccountListItem } from '@nimbo/contracts';
import { ArrowLeft, CheckCircle2, History, KeyRound, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Button, buttonVariants } from '../../../components/ui/button';
import { INTERNAL_PATHS } from '../../access/home-path';
import { ROLE_LABELS } from '../../access/role-labels';
import { useFocusOnMount } from '../../identity/account-setup/hooks/use-focus-on-mount';

export interface EnrollSuccessProps {
  readonly account: AccountListItem;
  readonly employeeCode: string;
  readonly onAnother: () => void;
}

function CreatedSummary({ account, employeeCode }: Omit<EnrollSuccessProps, 'onAnother'>) {
  const rows = [
    ['Nombre', account.fullName],
    ['Correo', account.email],
    ['Rol', ROLE_LABELS[account.role]],
    ['Código de empleado', employeeCode],
  ] as const;
  return (
    <dl className="mt-5 grid gap-x-4 gap-y-2 rounded-md bg-muted px-4 py-3 text-sm sm:grid-cols-3">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-secondary-foreground">{term}</dt>
          <dd className="break-all font-medium text-foreground sm:col-span-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NextSteps(): React.JSX.Element {
  return (
    <ul className="mt-4 grid gap-2 text-sm text-secondary-foreground">
      <li className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        El enlace es de un solo uso. Podrá iniciar sesión cuando fije su contraseña.
      </li>
      <li className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        El alta quedó registrada en la auditoría.
      </li>
    </ul>
  );
}

/** El mensaje pedido (CA-5), anunciado; el foco va a su título (decisión 11). */
function CreatedHead({ account }: { readonly account: AccountListItem }): React.JSX.Element {
  const titleRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <div role="status" className="flex items-start gap-3">
      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success-foreground" aria-hidden="true" />
      <div>
        <h2
          id="alta-creada"
          ref={titleRef}
          tabIndex={-1}
          className="text-lg font-semibold text-foreground outline-none"
        >
          {`Creamos la cuenta de ${account.fullName}.`}
        </h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          Le enviamos un enlace a{' '}
          <strong className="font-semibold text-foreground">{account.email}</strong> para que fije
          su contraseña.
        </p>
      </div>
    </div>
  );
}

/** Éxito en la misma página (decisión 11): resumen, próximos pasos, «Volver a cuentas» y «Crear otra cuenta». */
export function EnrollSuccess({
  account,
  employeeCode,
  onAnother,
}: EnrollSuccessProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="alta-creada"
      className="mt-5 rounded-lg border border-border bg-card p-5 shadow-card"
    >
      <CreatedHead account={account} />
      <CreatedSummary account={account} employeeCode={employeeCode} />
      <NextSteps />
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Link href={INTERNAL_PATHS.adminAccounts} className={buttonVariants()}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a cuentas
        </Link>
        <Button variant="outline" onClick={onAnother}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Crear otra cuenta
        </Button>
      </div>
    </section>
  );
}
