'use client';

import { STORAGE_ERROR_CODES, type RestoreResponse, type TrashItem } from '@nimbo/contracts';
import { SearchX, Trash2 } from 'lucide-react';
import * as React from 'react';

import { StateView } from '../../../components/nimbo/state-view';
import { ForbiddenState } from '../../access/components/forbidden-state';
import type { RestoreClientNodeCall } from '../api';
import { useClientTrash, type ClientTrash, type LoadClientTrash } from '../hooks/use-client-trash';
import { hasErrorCode } from '../hooks/use-latest-request';
import { useResetWithFocus } from '../hooks/use-reset-with-focus';
import { useSessionBackofficeApi } from '../hooks/use-session-backoffice-api';
import { restoredNotice, unavailableNotice } from '../trash-notices';

import { firstNameOf } from './account-values';
import { ClientFileSearch } from './client-file-search';
import { ClientTrashOutcome } from './client-trash-result';
import { PrivacyNotice } from './privacy-notice';
import { TrashRestoreDialog } from './trash-restore-dialog';

/** `POST /backoffice/client-trash/:nodeId/restore`; debe ser estable entre renders. */
export type RestoreClientNode = (request: RestoreClientNodeCall) => Promise<RestoreResponse>;

const TRASH_PRIVACY =
  'Soporte puede restaurar raíces de la papelera (archivos y carpetas), nunca abrirlas, descargarlas, editarlas ni borrarlas. Cada restauración exige un motivo y queda en la auditoría del cliente.';

/** Antes de buscar: qué hace la pantalla, sin botón (la búsqueda está arriba). */
function InitialState(): React.JSX.Element {
  return (
    <StateView
      type="empty"
      headingLevel="h2"
      icon={Trash2}
      className="mt-4"
      title="Busca a un cliente para ver su papelera"
      description="Verás las carpetas y archivos que borró y todavía se pueden restaurar. Cada restauración queda en la auditoría del cliente, que ve tu rol."
    />
  );
}

/** El mismo texto si el correo no existe o es de una cuenta interna (003 D-6). */
function NotFoundSearch({
  email,
  onClear,
}: {
  readonly email: string;
  readonly onClear: () => void;
}): React.JSX.Element {
  return (
    <StateView
      type="empty"
      role="status"
      headingLevel="h2"
      icon={SearchX}
      className="mt-4"
      title={`No encontramos una cuenta de cliente con «${email}».`}
      description="Revisa que el correo esté completo y bien escrito, o pídele al cliente el correo con el que inicia sesión."
      action={{ label: 'Limpiar búsqueda', onClick: onClear, variant: 'outline' }}
    />
  );
}

/** Elemento que se va a restaurar y el botón que abrió el diálogo (a él vuelve el foco al cancelar). */
interface RestoreTarget {
  readonly item: TrashItem;
  readonly opener: HTMLButtonElement;
}

interface RestoreFlowProps {
  readonly trash: ClientTrash;
  readonly restore: RestoreClientNode;
  readonly target: RestoreTarget;
  readonly onClose: (returnFocus: boolean) => void;
}

/**
 * Envío y cierre de una restauración. Un `404` (retención vencida, raíz ajena o ya restaurada: el mismo código a
 * propósito) no es un error del diálogo: `send` da `null`, la fila se quita y el aviso lo explica. Cualquier otro
 * rechazo se relanza y deja el diálogo abierto, con su aviso (CA-12, CA-17).
 */
function useRestoreFlow(
  { trash, restore, target, onClose }: RestoreFlowProps,
  client: { readonly email: string; readonly firstName: string },
) {
  const { item } = target;
  const send = async (note: string): Promise<RestoreResponse | null> => {
    try {
      return await restore({ email: client.email, nodeId: item.id, type: item.type, note });
    } catch (caught: unknown) {
      if (hasErrorCode(caught, STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)) return null;
      throw caught;
    }
  };
  const done = (response: RestoreResponse | null): void => {
    const notice =
      response === null
        ? unavailableNotice(item, client.firstName, new Date())
        : restoredNotice(item, response, client.firstName);
    trash.settle(item, notice);
    onClose(false);
  };
  return { send, done };
}

function ReadyRestoreFlow(
  props: RestoreFlowProps & { readonly email: string; readonly firstName: string },
): React.JSX.Element {
  const { email, firstName } = props;
  const { send, done } = useRestoreFlow(props, { email, firstName });
  return (
    <TrashRestoreDialog
      item={props.target.item}
      clientFirstName={firstName}
      restore={send}
      onDone={done}
      onClose={() => props.onClose(true)}
    />
  );
}

/** El diálogo solo existe con la papelera cargada: de ella salen el correo y el nombre del cliente. */
function RestoreFlow(props: RestoreFlowProps): React.JSX.Element | null {
  const { state } = props.trash;
  if (state.status !== 'ready') return null;
  const { email, fullName } = state.client;
  return <ReadyRestoreFlow {...props} email={email} firstName={firstNameOf(fullName)} />;
}

/** Qué se restaura y a qué botón vuelve el foco al cerrar: al desmontar el diálogo, que mientras está abierto lo atrapa. */
function useRestoreTarget() {
  const [target, setTarget] = React.useState<RestoreTarget | null>(null);
  const returnTo = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (target === null) returnTo.current?.focus();
    returnTo.current = null;
  }, [target]);
  const close = (returnFocus: boolean): void => {
    returnTo.current = returnFocus ? (target?.opener ?? null) : null;
    setTarget(null);
  };
  const open = (item: TrashItem, opener: HTMLButtonElement): void => setTarget({ item, opener });
  return { target, open, close };
}

function SearchResult({
  trash,
  restore,
  onClear,
}: {
  readonly trash: ClientTrash;
  readonly restore: RestoreClientNode;
  readonly onClear: () => void;
}): React.JSX.Element {
  const { target, open, close } = useRestoreTarget();
  const { state } = trash;
  return (
    <>
      {state.status === 'idle' ? <InitialState /> : null}
      {state.status === 'notFound' ? (
        <NotFoundSearch email={state.email} onClear={onClear} />
      ) : null}
      <ClientTrashOutcome trash={trash} onRestore={open} />
      {target === null ? null : (
        <RestoreFlow trash={trash} restore={restore} target={target} onClose={close} />
      )}
    </>
  );
}

/**
 * Papelera de un cliente para Soporte (011b CA-10 a CA-12, CA-17; mockup `backoffice/soporte`): buscar por correo
 * exacto, ver las raíces de su papelera y restaurar una con motivo. Soporte nunca abre, descarga ni borra (RN-3).
 */
export function SupportTrash({
  load,
  restore,
}: {
  readonly load: LoadClientTrash;
  readonly restore: RestoreClientNode;
}): React.JSX.Element {
  const trash = useClientTrash(load);
  const search = useResetWithFocus(trash.clear);
  // Un 403 (interno ya no activo, CA-14) es la pantalla común «sin permiso» (003 D-8), no un estado de la búsqueda.
  if (trash.state.status === 'forbidden') return <ForbiddenState role="SUPPORT" />;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-2xl font-semibold text-foreground">Papelera de archivos</h1>
      <p className="mt-1 text-sm text-secondary-foreground">
        Busca a un cliente por su correo para restaurar una carpeta o un archivo de su papelera.
      </p>
      <PrivacyNotice text={TRASH_PRIVACY} />
      <ClientFileSearch key={search.formKey} onSearch={trash.search} inputRef={search.inputRef} />
      <SearchResult trash={trash} restore={restore} onClear={search.reset} />
    </div>
  );
}

/** La pantalla de Soporte conectada a la API con la sesión en memoria (002). */
export function SessionSupportTrash({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  const api = useSessionBackofficeApi(apiPublicUrl);
  return <SupportTrash load={api.listClientTrash} restore={api.restoreClientNode} />;
}
