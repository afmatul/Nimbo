'use client';

import type { ReceivedShare } from '@nimbo/contracts';
import { Folder, Share2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { StateView } from '../../../components/nimbo/state-view';
import { buttonVariants } from '../../../components/ui/button';
import { openInBrowser } from '../../../lib/use-preparing-download';
import { RENEW_PATH } from '../../billing/routes';
import { DownloadNoticeBanner } from '../../storage/components/file-row-menu';
import { SidebarQuota } from '../../storage/components/sidebar-quota';
import { useReadOnlyAccount, useSpace } from '../../storage/components/space-provider';
import { useUploads } from '../../storage/hooks/use-upload-manager';
import { MY_FILES_PATH } from '../../storage/routes';
import { useReceivedShares, type ReceivedListing } from '../hooks/use-received-shares';
import { SHARED_WITH_ME_LABEL, SHARED_WITH_ME_PATH } from '../routes';
import type { SharingApi } from '../sharing-api';

import { LeaveShareDialog } from './leave-share-dialog';
import { ReceivedShareMenu } from './received-share-menu';
import { ReceivedShareRow } from './received-share-row';
import { useReceivedActions } from './use-received-actions';

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

/** Título (recibe el foco tras salir) y cuántos elementos hay. */
function ReceivedHeader({
  titleRef,
  listing,
}: {
  readonly titleRef: React.RefObject<HTMLHeadingElement | null>;
  readonly listing: ReceivedListing;
}): React.JSX.Element {
  return (
    <header className="space-y-1">
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="text-2xl font-semibold text-foreground focus-visible:outline-none"
      >
        {SHARED_WITH_ME_LABEL}
      </h1>
      {listing.status === 'ready' && listing.entries.length > 0 ? (
        <p className="text-sm tabular-nums text-secondary-foreground">
          {countLabel(listing.entries.length)}
        </p>
      ) : null}
    </header>
  );
}

/** La cuenta del destinatario en solo lectura puede ver, descargar y salir (CA-10; mockup `solo-lectura`). */
function ReceivedReadOnlyNotice(): React.JSX.Element | null {
  const { readOnly } = useReadOnlyAccount();
  if (!readOnly) return null;
  return (
    <ReadOnlyBanner
      description="Puedes ver y descargar lo que te compartieron, y salir de ello. Para editar o subir archivos, renueva tu plan."
      renewHref={RENEW_PATH}
    />
  );
}

export interface ReceivedSharesViewProps {
  readonly api: SharingApi;
  /** Abre la URL firmada; por omisión, en la pestaña (005 CA-13). */
  readonly openUrl?: (url: string) => void;
}

/**
 * «Compartidos conmigo» (spec 012b CA-8 a CA-11; mockup `sharing/compartidos-conmigo`): lo que me compartieron con
 * acceso directo, más reciente primero y sin paginar; cada elemento abre su carpeta o su ficha, se descarga si es un
 * archivo y se puede «Salir» de él.
 */
export function ReceivedSharesView({
  api,
  openUrl = openInBrowser,
}: ReceivedSharesViewProps): React.JSX.Element {
  const space = useSpace();
  const received = useReceivedShares(api);
  const { listing } = received;
  const requestUrl = useUploads().api.downloadUrl;
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const focusTitle = (): void => titleRef.current?.focus();
  const actions = useReceivedActions({ received, requestUrl, openUrl, focusTitle });
  return (
    <AppLayout navItems={RECEIVED_NAV_ITEMS} quotaCard={<SidebarQuota state={space.state} />}>
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <ReceivedReadOnlyNotice />
        <ReceivedHeader titleRef={titleRef} listing={listing} />
        {actions.notice ? (
          <DownloadNoticeBanner notice={actions.notice} onDismiss={() => actions.setNotice(null)} />
        ) : null}
        <ReceivedBody
          listing={listing}
          onRetry={received.reload}
          renderActions={(share) => (
            <ReceivedShareMenu
              share={share}
              onDownload={() => void actions.download(share)}
              onLeave={() => actions.setLeaving(share)}
            />
          )}
        />
      </div>
      <LeaveShareDialog
        target={actions.leaving}
        onConfirm={actions.confirmLeave}
        onClose={() => actions.setLeaving(null)}
      />
    </AppLayout>
  );
}
