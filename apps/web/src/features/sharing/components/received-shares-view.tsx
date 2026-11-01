'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import { Folder, Share2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { buttonVariants } from '../../../components/ui/button';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useSpace } from '../../storage/components/space-provider';
import { MY_FILES_PATH } from '../../storage/routes';
import { useReceivedShares, type ReceivedListing } from '../hooks/use-received-shares';
import { SHARED_WITH_ME_LABEL, SHARED_WITH_ME_PATH } from '../routes';
import type { SharingApi } from '../sharing-api';

import { ReceivedShareRow } from './received-share-row';

const RECEIVED_NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({
  ...item,
  active: item.href === SHARED_WITH_ME_PATH,
}));

const countLabel = (count: number): string =>
  count === 1 ? '1 elemento' : `${String(count)} elementos`;

function EmptyReceived(): React.JSX.Element {
  return (
    <section
      aria-labelledby="compartidos-vacio"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm"
    >
      <Share2 className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 id="compartidos-vacio" className="text-base font-semibold text-foreground">
        Todavía no te han compartido nada
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Lo que compartan contigo aparecerá aquí. Para recibirlo, la otra persona debe compartir con
        el correo de tu cuenta.
      </p>
      <Link href={MY_FILES_PATH} className={buttonVariants({ className: 'mt-5' })}>
        <Folder className="h-4 w-4" aria-hidden="true" />
        Ir a Mis archivos
      </Link>
    </section>
  );
}

interface ReceivedTableProps {
  readonly entries: readonly ReceivedShare[];
  readonly loadedAt: number;
  readonly renderActions: (share: ReceivedShare) => React.ReactNode;
}

function ReceivedTable({
  entries,
  loadedAt,
  renderActions,
}: ReceivedTableProps): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">
          Archivos y carpetas compartidos contigo, del más reciente al más antiguo
        </caption>
        <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-2 pl-3 sm:pl-4">
              Nombre
            </th>
            <th scope="col" className="hidden w-40 px-2 py-2 sm:table-cell">
              Compartido por
            </th>
            <th scope="col" className="hidden w-28 px-2 py-2 sm:table-cell">
              Tu nivel
            </th>
            <th scope="col" className="hidden w-40 px-2 py-2 sm:table-cell">
              Fecha
            </th>
            <th scope="col" className="w-14 px-2 py-2">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((share) => (
            <ReceivedShareRow
              key={share.shareId}
              share={share}
              loadedAt={loadedAt}
              actions={renderActions(share)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceivedBody({
  listing,
  onRetry,
  renderActions,
}: {
  readonly listing: ReceivedListing;
  readonly onRetry: () => void;
  readonly renderActions: ReceivedTableProps['renderActions'];
}): React.JSX.Element {
  if (listing.status === 'loading') {
    return <StateView type="loading" headingLevel="h2" title="Cargando lo que te compartieron…" />;
  }
  if (listing.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos cargar lo que te compartieron."
        description="Revisa tu conexión e inténtalo de nuevo. Tus accesos siguen igual."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
      />
    );
  }
  if (listing.entries.length === 0) return <EmptyReceived />;
  return (
    <ReceivedTable
      entries={listing.entries}
      loadedAt={listing.loadedAt}
      renderActions={renderActions}
    />
  );
}

export interface ReceivedSharesViewProps {
  readonly api: SharingApi;
}

/**
 * «Compartidos conmigo» (spec 012b CA-8 a CA-11; mockup `sharing/compartidos-conmigo`): lo que me compartieron con
 * acceso directo, más reciente primero y sin paginar; cada elemento abre su carpeta o su ficha.
 */
export function ReceivedSharesView({ api }: ReceivedSharesViewProps): React.JSX.Element {
  const space = useSpace();
  const { listing, reload } = useReceivedShares(api);
  return (
    <AppLayout navItems={RECEIVED_NAV_ITEMS} quotaCard={<SidebarQuota state={space.state} />}>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">{SHARED_WITH_ME_LABEL}</h1>
          {listing.status === 'ready' && listing.entries.length > 0 ? (
            <p className="text-sm tabular-nums text-secondary-foreground">
              {countLabel(listing.entries.length)}
            </p>
          ) : null}
        </header>
        <ReceivedBody listing={listing} onRetry={reload} renderActions={() => null} />
      </div>
    </AppLayout>
  );
}
