'use client';

import Link from 'next/link';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import type { SpaceSummaryState } from '../../storage/components/space-provider';

/** Páginas de la cuenta, como «Seguridad» y «Mi actividad»: ningún destino de la barra lateral queda marcado. */
const NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({ ...item, active: false }));

/** Un paso de las migas; el último es la página actual y no lleva enlace. */
export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/** Un paso después del separador: con enlace, salvo la página actual. */
function CrumbItem({
  crumb,
  current,
}: {
  readonly crumb: Crumb;
  readonly current: boolean;
}): React.JSX.Element {
  return (
    <>
      <li aria-hidden="true" className="text-muted-foreground">
        /
      </li>
      <li
        aria-current={current ? 'page' : undefined}
        className={current ? 'font-semibold text-foreground' : 'text-secondary-foreground'}
      >
        {crumb.href === undefined || current ? (
          crumb.label
        ) : (
          <Link href={crumb.href} className="hover:underline">
            {crumb.label}
          </Link>
        )}
      </li>
    </>
  );
}

function Breadcrumbs({ trail }: { readonly trail: readonly Crumb[] }): React.JSX.Element {
  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        <li className="text-secondary-foreground">Cuenta</li>
        {trail.map((crumb, index) => (
          <CrumbItem key={crumb.label} crumb={crumb} current={index === trail.length - 1} />
        ))}
      </ol>
    </nav>
  );
}

export interface BillingPageLayoutProps {
  readonly trail: readonly Crumb[];
  readonly space: SpaceSummaryState;
  readonly children: React.ReactNode;
}

/**
 * Marco de las páginas de `billing` en la cuenta (009 «Plan y facturación»; 010 cambio de plan y pago de la
 * renovación): la barra lateral sin destino marcado, las migas «Cuenta / …» y la tarjeta de espacio.
 */
export function BillingPageLayout({
  trail,
  space,
  children,
}: BillingPageLayoutProps): React.JSX.Element {
  return (
    <AppLayout
      navItems={NAV_ITEMS}
      topBar={<Breadcrumbs trail={trail} />}
      quotaCard={<SidebarQuota state={space} />}
    >
      {children}
    </AppLayout>
  );
}
