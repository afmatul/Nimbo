import { Folder, History, Loader2, Lock, Users } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { Badge } from '../../../components/ui/badge';
import { ROLE_LABELS } from '../../access/role-labels';
import type { ClientFiles } from '../hooks/use-client-files';

import { ClientFilesTable } from './client-files-table';
import { PagePager } from './page-pager';

/** Aviso fijo bajo el título (mockup `backoffice/soporte`, decisión 3): ícono y texto, no una alerta. */
export function PrivacyNotice({ text }: { readonly text: string }): JSX.Element {
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

const PULSE = 'block h-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none';
/** Anchos de la línea del nombre; distintos entre sí: sirven de `key`. */
const SKELETON_ROWS = ['w-3/5', 'w-1/2', 'w-2/3', 'w-2/5', 'w-4/5', 'w-1/3'];

/** Esqueleto del cliente y de la tabla (oculto a lectores) y el estado anunciado (mockup `cargando`). */
function ClientFilesLoading(): JSX.Element {
  return (
    <div aria-busy="true" className="mt-6">
      <div aria-hidden="true">
        <div className="grid max-w-sm gap-2">
          <span className={`${PULSE} w-1/2`} />
          <span className={`${PULSE} w-2/3`} />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-card">
          {SKELETON_ROWS.map((width) => (
            <div
              key={width}
              className="flex items-center gap-3 border-b border-border p-3.5 last:border-b-0"
            >
              <span className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
              <span className={`${PULSE} ${width}`} />
            </div>
          ))}
        </div>
      </div>
      <p role="status" className="mt-3 flex items-center gap-2 text-sm text-secondary-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Buscando la cuenta y sus archivos…
      </p>
    </div>
  );
}

/** «Esta consulta queda en la auditoría de…» (RN-2, CA-16): el cliente ve la fecha y el rol, nunca el nombre. */
function AuditNotice({ clientName }: { readonly clientName: string }): JSX.Element {
  const firstName = clientName.split(/\s+/)[0] ?? clientName;
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground">
      <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold text-foreground">{`Esta consulta queda en la auditoría de ${firstName}.`}</strong>
        {`Verá la fecha y tu rol (${ROLE_LABELS.SUPPORT}).`}
      </p>
    </div>
  );
}

interface FoundProps {
  readonly files: ClientFiles;
  readonly found: Extract<ClientFiles['state'], { status: 'found' }>;
}

/** Tabla con su paginación, o el vacío del cliente sin archivos (ni en la papelera, ni cargas sin terminar). */
function ClientFilesBody({ files, found }: FoundProps): JSX.Element {
  const { client, items, page, pageSize, total } = found.result;
  if (total === 0) {
    return (
      <StateView
        type="empty"
        role="status"
        headingLevel="h3"
        icon={Folder}
        className="mt-4"
        title={`${client.fullName} no tiene archivos.`}
        description="No hay archivos en su cuenta ni en su papelera. Las cargas que no terminaron no aparecen aquí."
      />
    );
  }
  return (
    <div aria-busy={found.paging || undefined}>
      <ClientFilesTable clientName={client.fullName} items={items} />
      <PagePager
        label={`Paginación de los archivos de ${client.fullName}`}
        noun="archivos"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={files.goToPage}
      />
    </div>
  );
}

/** El cliente consultado (nombre, correo y «Cliente»; sin plan ni espacio, CA-13), el aviso de auditoría y sus archivos. */
function ClientSection({ files, found }: FoundProps): JSX.Element {
  const { client } = found.result;
  return (
    <section aria-labelledby="cliente-titulo" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <h2 id="cliente-titulo" className="text-xl font-bold text-foreground">
            {client.fullName}
          </h2>
          <p className="break-all text-sm text-secondary-foreground">{client.email}</p>
        </div>
        <Badge variant="outline" className="mt-1 gap-1 bg-muted text-secondary-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Cliente
        </Badge>
      </div>
      <AuditNotice clientName={client.fullName} />
      <ClientFilesBody files={files} found={found} />
    </section>
  );
}

/**
 * Estados del resultado de la búsqueda de Soporte (011 CA-13, CA-17): cargando, el cliente con sus archivos y error
 * con «Reintentar». `idle`, `notFound` y `forbidden` los resuelve la pantalla.
 */
export function ClientFilesOutcome({ files }: { readonly files: ClientFiles }): ReactNode {
  const { state } = files;
  if (state.status === 'loading') return <ClientFilesLoading />;
  if (state.status === 'found') return <ClientSection files={files} found={state} />;
  if (state.status !== 'error') return null;
  return (
    <StateView
      type="error"
      headingLevel="h2"
      className="mt-4"
      title="No pudimos completar la búsqueda."
      description="Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: files.retry, variant: 'outline' }}
    />
  );
}
