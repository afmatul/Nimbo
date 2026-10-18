'use client';

import type { AccountListItem } from '@nimbo/contracts';
import { Ban, FileSearch, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Button, buttonVariants } from '../../../components/ui/button';
import { adminAccountFilesPath } from '../../access/home-path';
import type { AccountStatusActions } from '../hooks/use-account-status';
import { useReturnFocus } from '../hooks/use-return-focus';

import { firstNameOf, isInternal } from './account-values';
import { ProfileCard } from './profile-card';

/** Borde y texto destructivos sobre la tarjeta: la acción de mayor riesgo se distingue antes de confirmarla. */
const DESTRUCTIVE_OUTLINE = 'border-destructive text-destructive hover:bg-destructive/5';

function ActionBlock({
  title,
  text,
  children,
}: {
  readonly title: string;
  readonly text: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-secondary-foreground">{text}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Solo en clientes (decisión 11): las internas no guardan archivos. La URL lleva el id, nunca el correo. */
function FilesAction({ account }: { readonly account: AccountListItem }): React.JSX.Element {
  return (
    <ActionBlock
      title="Metadatos de archivos"
      text={`Nombre, tipo, tamaño, fechas y estado de sus archivos. La consulta queda en la auditoría que ve ${firstNameOf(account.fullName)}.`}
    >
      <Link
        href={adminAccountFilesPath(account.id)}
        className={buttonVariants({ variant: 'outline' })}
      >
        <FileSearch className="h-4 w-4" aria-hidden="true" />
        Ver metadatos de archivos
      </Link>
    </ActionBlock>
  );
}

const STATUS_TEXTS = {
  active: {
    client:
      'Cierra sus sesiones y pausa sus comparticiones y enlaces mientras esté suspendida. No borra nada.',
    internal:
      'Cierra sus sesiones y no podrá iniciar sesión mientras esté suspendida. No borra nada.',
  },
  suspended: {
    client:
      'Podrá iniciar sesión de nuevo y sus comparticiones y enlaces vuelven como estaban. Las sesiones cerradas no vuelven.',
    internal: 'Podrá iniciar sesión de nuevo. Las sesiones cerradas no vuelven.',
  },
} as const;

interface StatusActionProps {
  readonly account: AccountListItem;
  readonly status: AccountStatusActions;
}

/**
 * Suspender o reactivar (CA-2, CA-3). Es el mismo botón en los dos estados: al cerrar el diálogo el foco vuelve a él,
 * ya con la acción nueva.
 */
function StatusAction({ account, status }: StatusActionProps): React.JSX.Element {
  const actionRef = useReturnFocus(status.asking !== null);
  const suspended = account.status === 'suspended';
  const Icon = suspended ? RotateCcw : Ban;
  const label = suspended ? 'Reactivar cuenta' : 'Suspender cuenta';
  return (
    <ActionBlock
      title={label}
      text={STATUS_TEXTS[account.status][isInternal(account) ? 'internal' : 'client']}
    >
      <Button
        ref={actionRef}
        variant={suspended ? 'default' : 'outline'}
        className={suspended ? undefined : DESTRUCTIVE_OUTLINE}
        onClick={() => status.ask(suspended ? 'reactivate' : 'suspend')}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    </ActionBlock>
  );
}

/** CA-4 en la UI (decisión 10): en la propia ficha no se ofrece lo que el servidor niega; se dice por qué. */
function SelfNotice(): React.JSX.Element {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold text-foreground">
          No puedes suspender tu propia cuenta.
        </strong>
        Si necesitas hacerlo, pídeselo a otro Administrador.
      </p>
    </div>
  );
}

/** «Acciones» de la ficha (mockup `backoffice/admin`): metadatos (clientes) y suspender o reactivar (no la propia). */
export function AccountActions({ account, status }: StatusActionProps): React.JSX.Element {
  if (account.isSelf) {
    return (
      <ProfileCard id="acciones-cuenta" title="Acciones">
        <SelfNotice />
      </ProfileCard>
    );
  }
  return (
    <ProfileCard
      id="acciones-cuenta"
      title="Acciones"
      subtitle="Cada acción queda en la auditoría de la cuenta; la persona ve la acción y tu rol."
    >
      {isInternal(account) ? null : <FilesAction account={account} />}
      <StatusAction account={account} status={status} />
    </ProfileCard>
  );
}
