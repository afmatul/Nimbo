import { History, Trash2 } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { LoadMore } from '../../storage/components/load-more';
import type { ClientTrash, ClientTrashState } from '../hooks/use-client-trash';
import type { TrashNotice } from '../trash-notices';

import { firstNameOf, RoleBadge } from './account-values';
import { ClientTrashTable } from './client-trash-table';
import { LoadingStatus, SkeletonLine } from './loading';

type ReadyState = Extract<ClientTrashState, { status: 'ready' }>;

const SKELETON_ROWS = ['w-3/5', 'w-1/2', 'w-2/3'];

/** Esqueleto del cliente y de la tabla (oculto a lectores) y el estado anunciado (mockup `papelera-cargando`). */
export function ClientTrashLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="mt-6">
      <div aria-hidden="true">
        <div className="grid max-w-sm gap-2">
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-2/3" />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-card">
          {SKELETON_ROWS.map((width) => (
            <div
              key={width}
              className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0"
            >
              <span className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
              <SkeletonLine className={width} />
            </div>
          ))}
        </div>
      </div>
      <LoadingStatus text="Buscando la cuenta y su papelera…" />
    </div>
  );
}

/** «Cada restauración queda en la auditoría de…» (RN-2, CA-16): el cliente ve la fecha, el motivo y el rol, nunca el nombre. */
function AuditNotice({ firstName }: { readonly firstName: string }): React.JSX.Element {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground">
      <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold text-foreground">{`Cada restauración queda en la auditoría de ${firstName}.`}</strong>
        Verá la fecha, el motivo que escribas y tu rol (Soporte), no tu nombre.
      </p>
    </div>
  );
}

/** Resultado de la última restauración: recibe el foco al aparecer para que se anuncie y el teclado no se pierda. */
function NoticeBanner({
  notice,
  onDismiss,
}: {
  readonly notice: TrashNotice;
  readonly onDismiss: () => void;
}): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, [notice]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="mt-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Alert variant={notice.tone} className="flex flex-wrap items-start justify-between gap-3">
        <p>
          <strong className="block font-semibold">{notice.title}</strong>
          <span className="text-secondary-foreground">{notice.detail}</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Entendido
        </Button>
      </Alert>
    </div>
  );
}

function EmptyTrash({ fullName }: { readonly fullName: string }): React.JSX.Element {
  return (
    <StateView
      type="empty"
      role="status"
      headingLevel="h3"
      icon={Trash2}
      className="mt-4"
      title={`La papelera de ${fullName} está vacía.`}
      description="Los archivos y carpetas que borre aparecerán aquí hasta que termine su retención."
    />
  );
}

interface SectionProps {
  readonly trash: ClientTrash;
  readonly ready: ReadyState;
  readonly onRestore: (item: ReadyState['items'][number], opener: HTMLButtonElement) => void;
}

function TrashBody({ trash, ready, onRestore }: SectionProps): React.JSX.Element {
  const { client, items, more, added, nextCursor } = ready;
  if (items.length === 0 && nextCursor === null) return <EmptyTrash fullName={client.fullName} />;
  return (
    <>
      <ClientTrashTable clientName={client.fullName} items={items} onRestore={onRestore} />
      <div className="mt-4">
        <LoadMore
          status={more}
          hasMore={nextCursor !== null}
          added={added}
          placeName={`la papelera de ${client.fullName}`}
          onLoadMore={trash.loadMore}
          onDismissError={trash.dismissMoreError}
        />
      </div>
    </>
  );
}

/** El cliente (nombre, correo y «Cliente»), el aviso de auditoría, el último resultado y las raíces de su papelera. */
function ClientTrashSection(props: SectionProps): React.JSX.Element {
  const { client, notice } = props.ready;
  return (
    <section aria-labelledby="cliente-titulo" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <h2 id="cliente-titulo" className="text-xl font-bold text-foreground">
            {client.fullName}
          </h2>
          <p className="break-all text-sm text-secondary-foreground">{client.email}</p>
        </div>
        <div className="mt-1">
          <RoleBadge role="CLIENT" />
        </div>
      </div>
      <AuditNotice firstName={firstNameOf(client.fullName)} />
      {notice === null ? null : (
        <NoticeBanner notice={notice} onDismiss={props.trash.dismissNotice} />
      )}
      <TrashBody {...props} />
    </section>
  );
}

/**
 * Estados del resultado de la búsqueda (011b CA-10, CA-17): cargando, el cliente con su papelera y error con
 * «Reintentar». `idle`, `notFound` y `forbidden` los resuelve la pantalla.
 */
export function ClientTrashOutcome({
  trash,
  onRestore,
}: {
  readonly trash: ClientTrash;
  readonly onRestore: SectionProps['onRestore'];
}): React.ReactNode {
  const { state } = trash;
  if (state.status === 'loading') return <ClientTrashLoading />;
  if (state.status === 'ready')
    return <ClientTrashSection trash={trash} ready={state} onRestore={onRestore} />;
  if (state.status !== 'error') return null;
  return (
    <StateView
      type="error"
      headingLevel="h2"
      className="mt-4"
      title="No pudimos cargar la papelera."
      description="Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: trash.retry, variant: 'outline' }}
    />
  );
}
