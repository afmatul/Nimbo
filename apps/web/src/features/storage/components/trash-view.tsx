'use client';

import type { TrashItem } from '@nimbo/contracts';
import { Folder, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { AppLayout, DEFAULT_NAV_ITEMS } from '../../../components/nimbo/app-layout';
import { StateView } from '../../../components/nimbo/state-view';
import { Button, buttonVariants } from '../../../components/ui/button';
import { SignOutButton } from '../../identity/components/sign-out-button';
import { useTrash, type TrashListing } from '../hooks/use-trash';
import { useTrashActions } from '../hooks/use-trash-actions';
import { useUploads } from '../hooks/use-upload-manager';
import { MY_FILES_PATH, TRASH_PATH } from '../routes';
import { daysLeft, isPurgeDue, PURGE_SOON_DAYS } from '../trash-dates';

import { DownloadNoticeBanner, type DownloadNotice } from './file-row-menu';
import { PurgeConfirmDialog } from './purge-confirm-dialog';
import { useQuickAccessSidebar } from './quick-access-sidebar';
import { ReadOnlyActionsHint, ReadOnlyNotice } from './read-only-notice';
import { RestoreResult } from './restore-result';
import { SidebarQuota } from './sidebar-quota';
import { useSpace } from './space-provider';
import { TrashList } from './trash-list';
import { TrashSelectionBar } from './trash-selection-bar';
import { EmptyingNotice, PurgeSoonNote, retentionLabel, TrashSummary } from './trash-summary';

const TRASH_NAV_ITEMS = DEFAULT_NAV_ITEMS.map((item) => ({
  ...item,
  active: item.href === TRASH_PATH,
}));

type ReadyListing = Extract<TrashListing, { status: 'ready' }>;

function elementsLabel(count: number): string {
  return count === 1 ? '1 elemento' : `${String(count)} elementos`;
}

function purgeSoonCount(items: readonly TrashItem[], now: number): number {
  return items.filter(
    (item) => !isPurgeDue(item.purgeAt, now) && daysLeft(item.purgeAt, now) <= PURGE_SOON_DAYS,
  ).length;
}

function bytesOf(items: readonly TrashItem[], ids: ReadonlySet<string>): number {
  return items.filter((item) => ids.has(item.id)).reduce((sum, item) => sum + item.sizeBytes, 0);
}

/**
 * Papelera (spec 006, mockup `storage/papelera`): resumen, aviso de purga próxima, lista con selección, restaurar con
 * resultado por elemento, eliminar definitivamente y vaciar en diferido. Sin descarga ni vista previa (CA-12).
 */
export function TrashView(): React.JSX.Element {
  const { api } = useUploads();
  const space = useSpace();
  const trash = useTrash(api, space.refresh);
  const actions = useTrashActions(api, trash);
  const { listing, emptying } = trash;
  const ready = listing.status === 'ready' && listing.items.length > 0 ? listing : null;
  const selected = ready ? ready.items.filter((item) => actions.selectedIds.has(item.id)) : [];
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  const sidebar = useQuickAccessSidebar({ api, openedFolderId: null, onNotice: setNotice });
  /** Lo restaurado vuelve a la barra si estaba fijado o era reciente (CA-27). */
  const restore = (items: readonly TrashItem[]): void =>
    void actions.restore(items).then(sidebar.quickAccess.reload);

  return (
    <AppLayout
      navItems={TRASH_NAV_ITEMS}
      sidebarSection={sidebar.sidebarSection}
      trashCount={listing.status === 'ready' ? listing.summary.itemCount : undefined}
      quotaCard={<SidebarQuota state={space.state} />}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <SignOutButton />
        </div>
        <ReadOnlyNotice />
        <ReadOnlyActionsHint />
        {notice ? <DownloadNoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}
        <section className="flex flex-col gap-4" aria-labelledby="papelera-titulo">
          <TrashHeader
            ready={ready}
            emptying={emptying !== null}
            onEmpty={(summary) => actions.setPurgeTarget({ scope: 'all', ...summary })}
          />
          <TrashBody listing={listing} onRetry={trash.reload}>
            {actions.result ? (
              <RestoreResult lines={actions.result} onDismiss={actions.dismissResult} />
            ) : null}
            {ready ? (
              <>
                {emptying ? (
                  <EmptyingNotice pendingBytes={emptying.pendingBytes} />
                ) : (
                  <PurgeSoonNote count={purgeSoonCount(ready.items, ready.loadedAt)} />
                )}
                <TrashSelectionBar
                  count={selected.length}
                  totalBytes={bytesOf(ready.items, actions.selectedIds)}
                  busy={actions.restoring}
                  onRestore={() => restore(selected)}
                  onClear={() => actions.setSelectedIds(new Set())}
                />
                <TrashList
                  items={ready.items}
                  now={ready.loadedAt}
                  emptying={emptying !== null}
                  busy={actions.restoring}
                  selectedIds={actions.selectedIds}
                  onSelectionChange={actions.setSelectedIds}
                  onRestore={(item) => restore([item])}
                  onPurge={(item) => actions.setPurgeTarget({ scope: 'item', item })}
                />
              </>
            ) : null}
          </TrashBody>
        </section>
      </div>
      <PurgeConfirmDialog
        target={actions.purgeTarget}
        onConfirm={actions.confirmPurge}
        onClose={() => actions.setPurgeTarget(null)}
      />
    </AppLayout>
  );
}

/** Título, cantidad y «Vaciar papelera» (`outline` con texto y borde `destructive`, 5.39:1). */
function TrashHeader({
  ready,
  emptying,
  onEmpty,
}: {
  readonly ready: ReadyListing | null;
  readonly emptying: boolean;
  readonly onEmpty: (summary: { itemCount: number; totalBytes: number }) => void;
}): React.JSX.Element {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 id="papelera-titulo" className="text-xl font-semibold tracking-tight text-foreground">
          Papelera
        </h1>
        {ready ? (
          <p className="text-sm tabular-nums text-secondary-foreground">
            {elementsLabel(ready.summary.itemCount)}
          </p>
        ) : null}
      </div>
      {ready ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-destructive text-destructive hover:text-destructive sm:w-auto"
          disabled={emptying}
          onClick={() => onEmpty(ready.summary)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Vaciar papelera
        </Button>
      ) : null}
    </header>
  );
}

/**
 * Cargando, error, vacía o la lista con el resumen arriba (CA-12). `children` va debajo del resumen: el resultado de
 * restaurar, los avisos y la lista.
 */
function TrashBody({
  listing,
  onRetry,
  children,
}: {
  readonly listing: TrashListing;
  readonly onRetry: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  if (listing.status === 'loading') {
    return <StateView type="loading" headingLevel="h2" title="Cargando la papelera…" />;
  }
  if (listing.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h2"
        title="No pudimos cargar la papelera."
        description="Lo que eliminaste sigue a salvo. Inténtalo de nuevo."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
      />
    );
  }
  if (listing.items.length === 0) {
    return (
      <>
        {children}
        <EmptyTrash retentionDays={listing.summary.retentionDays} />
      </>
    );
  }
  return (
    <>
      <TrashSummary summary={listing.summary} />
      {children}
    </>
  );
}

function EmptyTrash({ retentionDays }: { readonly retentionDays: number }): React.JSX.Element {
  return (
    <section
      aria-labelledby="papelera-vacia"
      className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm"
    >
      <Trash2 className="mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 id="papelera-vacia" className="text-base font-semibold text-foreground">
        La papelera está vacía
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {`Lo que elimines aparecerá aquí durante ${retentionLabel(retentionDays)}, la retención de tu plan.`}
      </p>
      <Link
        href={MY_FILES_PATH}
        className={buttonVariants({ variant: 'outline', className: 'mt-5' })}
      >
        <Folder className="h-4 w-4" aria-hidden="true" />
        Ir a Mis archivos
      </Link>
    </section>
  );
}
