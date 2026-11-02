'use client';

import type { FileVersionSummary } from '@nimbo/contracts';
import { Download, History, Info, Undo2 } from 'lucide-react';
import type * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { VersionTimeline, versionByline } from '../../../components/nimbo/version-timeline';
import { Button } from '../../../components/ui/button';
import { useSession } from '../../identity/session/session-provider';
import type { ReadyVersionsListing, VersionsListing } from '../hooks/use-file-versions';
import type { VersionActions } from '../hooks/use-version-actions';
import { currentVersionOf, historySummary, versionToPrune } from '../version-history';

import type { RestoreTarget } from './restore-version-dialog';
import { useReadOnlyAccount, useSpace } from './space-provider';

const HISTORY_TITLE_ID = 'historial-versiones';
const ACTION_CLASS = 'h-11 flex-1 sm:h-9 sm:flex-none';

function restoreTargetOf(
  version: FileVersionSummary,
  listing: ReadyVersionsListing,
  viewerId: string | null,
): RestoreTarget {
  return {
    version,
    byline: versionByline(version, viewerId, listing.loadedAt),
    currentNumber: currentVersionOf(listing.items)?.number ?? version.number,
    retainedVersions: listing.retainedVersions,
    prunedNumber: versionToPrune(listing.items, listing.retainedVersions),
  };
}

export interface HistoryCardProps {
  readonly listing: VersionsListing;
  readonly actions: VersionActions;
  readonly onRetry: () => void;
  /** Aviso arriba de la lista. */
  readonly children: React.ReactNode;
}

/** «Historial de versiones» de la ficha (014 CA-6, CA-20): resumen del plan, la línea de tiempo y sus estados. */
export function HistoryCard({
  listing,
  actions,
  onRetry,
  children,
}: HistoryCardProps): React.JSX.Element {
  const planName = usePlanName();
  return (
    <section
      aria-labelledby={HISTORY_TITLE_ID}
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <div className="px-4 py-4 sm:px-5">
        <h2 id={HISTORY_TITLE_ID} className="text-base font-semibold text-foreground">
          Historial de versiones
        </h2>
        {listing.status === 'ready' ? (
          <p className="text-sm text-secondary-foreground">
            {historySummary(listing.items.length, listing.retainedVersions, planName)}
          </p>
        ) : null}
      </div>
      {children ? <div className="px-4 pb-4 sm:px-5">{children}</div> : null}
      <HistoryBody listing={listing} actions={actions} onRetry={onRetry} />
    </section>
  );
}

function usePlanName(): string | null {
  const { state } = useSpace();
  return state.status === 'ready' ? state.summary.planName : null;
}

function HistoryBody({
  listing,
  actions,
  onRetry,
}: Omit<HistoryCardProps, 'children'>): React.JSX.Element | null {
  if (listing.status === 'loading') {
    return (
      <StateView
        type="loading"
        headingLevel="h3"
        title="Cargando el historial…"
        className="m-4 sm:m-5"
      />
    );
  }
  if (listing.status === 'error') {
    return (
      <StateView
        type="error"
        headingLevel="h3"
        title="No pudimos cargar el historial."
        description="Tus versiones siguen guardadas. Inténtalo de nuevo en unos segundos."
        action={{ label: 'Reintentar', onClick: onRetry, variant: 'outline' }}
        className="m-4 sm:m-5"
      />
    );
  }
  return listing.status === 'ready' ? <ReadyHistory listing={listing} actions={actions} /> : null;
}

interface ReadyHistoryProps {
  readonly listing: ReadyVersionsListing;
  readonly actions: VersionActions;
}

function ReadyHistory({ listing, actions }: ReadyHistoryProps): React.JSX.Element {
  const viewerId = useSession().user?.id ?? null;
  return (
    <>
      <VersionTimeline
        labelledBy={HISTORY_TITLE_ID}
        versions={listing.items}
        viewerId={viewerId}
        now={listing.loadedAt}
        highlightedId={actions.highlightedId}
        renderActions={(version) => (
          <VersionButtons
            version={version}
            actions={actions}
            onRestore={() => actions.openRestore(restoreTargetOf(version, listing, viewerId))}
          />
        )}
      />
      {listing.items.length === 1 ? <NoPreviousVersions /> : <RestoreNote />}
    </>
  );
}

interface VersionButtonsProps {
  readonly version: FileVersionSummary;
  readonly actions: VersionActions;
  readonly onRestore: () => void;
}

/** «Descargar» en todas; «Restaurar» en todas salvo la actual (CA-20). */
function VersionButtons({ version, actions, onRestore }: VersionButtonsProps): React.JSX.Element {
  const number = String(version.number);
  const preparing = actions.preparingId === version.id;
  return (
    <>
      <DownloadVersionButton
        number={number}
        preparing={preparing}
        onClick={() => void actions.download(version)}
      />
      {version.isCurrent ? null : <RestoreVersionButton number={number} onClick={onRestore} />}
      <span role="status" className="sr-only">
        {preparing ? `Preparando la descarga de la versión ${number}…` : ''}
      </span>
    </>
  );
}

interface VersionButtonProps {
  readonly number: string;
  readonly onClick: () => void;
}

function DownloadVersionButton({
  number,
  preparing,
  onClick,
}: VersionButtonProps & { readonly preparing: boolean }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={ACTION_CLASS}
      aria-label={`Descargar la versión ${number}`}
      aria-disabled={preparing || undefined}
      onClick={onClick}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {preparing ? 'Preparando…' : 'Descargar'}
    </Button>
  );
}

/** Deshabilitado en solo lectura (010 CA-14). */
function RestoreVersionButton({ number, onClick }: VersionButtonProps): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={ACTION_CLASS}
      aria-label={`Restaurar la versión ${number}`}
      onClick={onClick}
      disabled={readOnly}
    >
      <Undo2 className="h-4 w-4" aria-hidden="true" />
      Restaurar
    </Button>
  );
}

function RestoreNote(): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm text-secondary-foreground sm:px-5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      Restaurar crea una versión nueva; solo se elimina la más antigua cuando pasas el límite de tu
      plan.
    </p>
  );
}

/** Una sola versión (CA-20): cómo nacen las demás. */
function NoPreviousVersions(): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 border-t border-dashed border-border px-4 py-4 text-sm sm:px-5">
      <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">Aún no hay versiones anteriores.</p>
        <p className="text-secondary-foreground">
          Cuando subas un archivo con el mismo nombre y elijas «Reemplazar», o restaures una
          versión, aquí verás el historial.
        </p>
      </div>
    </div>
  );
}
