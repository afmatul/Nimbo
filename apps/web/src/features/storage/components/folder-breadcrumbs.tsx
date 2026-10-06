'use client';

import type { FolderRef } from '@nimbo/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { MY_FILES_LABEL, MY_FILES_PATH, folderPath } from '../routes';

/** Con más migas que estas (raíz incluida) se colapsan las intermedias en «…» (mockup `limite-niveles`). */
const MAX_VISIBLE_CRUMBS = 4;
/** Carpetas que quedan a la vista al final cuando se colapsa. */
const TRAILING_CRUMBS = 2;

interface Crumb {
  readonly name: string;
  readonly href: string;
}

const ROOT_CRUMB: Crumb = { name: MY_FILES_LABEL, href: MY_FILES_PATH };

function crumbOf(ref: FolderRef): Crumb {
  return { name: ref.name, href: folderPath(ref.id) };
}

const LINK_CLASS =
  'inline-flex min-h-6 max-w-48 items-center truncate rounded-sm text-secondary-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Separator(): React.JSX.Element {
  return <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function CrumbItem({
  crumb,
  current,
}: {
  readonly crumb: Crumb;
  readonly current: boolean;
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 items-center gap-1">
      {current ? (
        <span aria-current="page" className="truncate font-medium text-foreground">
          {crumb.name}
        </span>
      ) : (
        <Link href={crumb.href} className={LINK_CLASS}>
          {crumb.name}
        </Link>
      )}
    </li>
  );
}

function CollapsedCrumbs({ hidden }: { readonly hidden: readonly Crumb[] }): React.JSX.Element {
  return (
    <li className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Mostrar ${String(hidden.length)} carpetas intermedias`}
          className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-sm text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          …
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {hidden.map((crumb) => (
            <DropdownMenuItem key={crumb.href} asChild>
              <Link href={crumb.href}>{crumb.name}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export interface FolderBreadcrumbsProps {
  /** Desde el primer nivel hasta la carpeta abierta, sin «Mis archivos» (`GET /folders/contents`). */
  readonly breadcrumbs: readonly FolderRef[];
}

/** Migas de la barra superior (escritorio). La carpeta abierta es la página actual y no es enlace. */
export function FolderBreadcrumbs({ breadcrumbs }: FolderBreadcrumbsProps): React.JSX.Element {
  const crumbs = [ROOT_CRUMB, ...breadcrumbs.map(crumbOf)];
  const collapse = crumbs.length > MAX_VISIBLE_CRUMBS;
  const shown = collapse ? [ROOT_CRUMB, ...crumbs.slice(-TRAILING_CRUMBS)] : crumbs;
  const hidden = collapse ? crumbs.slice(1, -TRAILING_CRUMBS) : [];
  const [root, ...rest] = shown;

  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {root ? <CrumbItem crumb={root} current={rest.length === 0} /> : null}
        {collapse ? (
          <>
            <Separator />
            <CollapsedCrumbs hidden={hidden} />
          </>
        ) : null}
        {rest.map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            <Separator />
            <CrumbItem crumb={crumb} current={index === rest.length - 1} />
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

/** En pantallas angostas, en lugar de migas: «‹ {carpeta anterior}» o «‹ Mis archivos» en el primer nivel. */
export function FolderBackLink({ breadcrumbs }: FolderBreadcrumbsProps): React.JSX.Element {
  const parent = breadcrumbs.at(-2);
  const target = parent ? crumbOf(parent) : ROOT_CRUMB;
  return (
    <Link
      href={target.href}
      aria-label={`Volver a ${target.name}`}
      className="inline-flex min-h-11 max-w-full items-center gap-1 self-start rounded-md px-1.5 text-sm font-medium text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
    >
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{target.name}</span>
    </Link>
  );
}
