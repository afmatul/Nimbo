'use client';

import type { AccessEntry, ShareLevel } from '@nimbo/contracts';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import type { AccessListState } from '../hooks/use-access-list';
import { LEVEL_LABELS } from '../share-levels';
import { shareMessageOf, type ShareMessage } from '../share-messages';

import {
  DirectAccessRow,
  InheritedAccessRow,
  type DirectAccess,
  type DirectAccessActions,
} from './access-row';
import { RevokeAccessDialog } from './revoke-access-dialog';
import { ShareErrorAlert } from './share-error-alert';

export interface AccessListProps {
  readonly access: AccessListState;
  /** Nombre del archivo o la carpeta, para la confirmación de «Quitar acceso». */
  readonly nodeName: string;
}

const REVOKED_NOTICE = 'Quitamos el acceso. Esa persona ya no puede abrirlo.';

interface ChangeFailure {
  readonly message: ShareMessage;
  readonly retry: () => void;
}

/** Cambiar el nivel de un acceso directo con su aviso de éxito o de error (spec 012b CA-4). */
function useChangeLevel(access: AccessListState, setNotice: (notice: string | null) => void) {
  const [failure, setFailure] = React.useState<ChangeFailure | null>(null);
  const [changingId, setChangingId] = React.useState<string | null>(null);

  const changeLevel = async (entry: DirectAccess, level: ShareLevel): Promise<void> => {
    setNotice(null);
    setFailure(null);
    setChangingId(entry.shareId);
    try {
      await access.share({ email: entry.grantee.email, level });
      setNotice(`${entry.grantee.displayName} ahora es ${LEVEL_LABELS[level]}.`);
    } catch (error) {
      setFailure({ message: shareMessageOf(error), retry: () => void changeLevel(entry, level) });
    } finally {
      setChangingId(null);
    }
  };
  return { failure, changingId, changeLevel };
}

/** Cambiar el nivel y quitar accesos (spec 012b CA-4, CA-5); el aviso de éxito es uno para ambos. */
function useAccessActions(access: AccessListState) {
  const [notice, setNotice] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<DirectAccess | null>(null);
  const { failure, changingId, changeLevel } = useChangeLevel(access, setNotice);

  const confirmRevoke = async (): Promise<void> => {
    if (revoking === null) return;
    await access.revoke(revoking.shareId);
    setNotice(REVOKED_NOTICE);
  };
  const rowActions: DirectAccessActions = {
    onChangeLevel: (entry, level) => void changeLevel(entry, level),
    onRevoke: (entry) => {
      setNotice(null);
      setRevoking(entry);
    },
    changingId,
  };
  return { notice, failure, rowActions, revoking, setRevoking, confirmRevoke };
}

const LOAD_FAILED: ShareMessage = {
  title: 'No pudimos cargar quién tiene acceso. Revisa tu conexión e inténtalo de nuevo.',
  fix: 'retry',
};

function LoadingAccess(): React.JSX.Element {
  return (
    <p role="status" className="flex items-center gap-2 py-3 text-sm text-secondary-foreground">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Cargando quién tiene acceso…
    </p>
  );
}

function AccessEntries({
  entries,
  rowActions,
}: {
  readonly entries: readonly AccessEntry[];
  readonly rowActions: DirectAccessActions;
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) =>
        entry.origin === 'direct' ? (
          <DirectAccessRow key={entry.shareId} entry={entry} actions={rowActions} />
        ) : (
          <InheritedAccessRow
            key={`${entry.grantee.id}-${entry.inheritedFrom.folderId}`}
            entry={entry}
          />
        ),
      )}
    </ul>
  );
}

function ListBody({
  access,
  rowActions,
}: {
  readonly access: AccessListState;
  readonly rowActions: DirectAccessActions;
}): React.JSX.Element {
  const { listing } = access;
  if (listing.status === 'loading') return <LoadingAccess />;
  if (listing.status === 'error') {
    return <ShareErrorAlert message={LOAD_FAILED} handlers={{ retry: access.reload }} />;
  }
  if (listing.entries.length === 0) {
    return (
      <p className="py-3 text-sm text-secondary-foreground">
        Todavía no compartiste esto con nadie.
      </p>
    );
  }
  return <AccessEntries entries={listing.entries} rowActions={rowActions} />;
}

/**
 * «Personas con acceso» (spec 012b CA-1, CA-4, CA-5; `ui-guidelines.md` §4 `AccessList`): cargando, vacía, con
 * personas (directas y heredadas) y error de carga; el nivel en texto y quitar con confirmación.
 */
export function AccessList({ access, nodeName }: AccessListProps): React.JSX.Element {
  const actions = useAccessActions(access);
  return (
    <section aria-labelledby="personas-con-acceso" className="space-y-2">
      <h3 id="personas-con-acceso" className="text-sm font-semibold text-foreground">
        Personas con acceso
      </h3>
      {actions.notice ? <Alert variant="success">{actions.notice}</Alert> : null}
      {actions.failure ? (
        <ShareErrorAlert
          message={actions.failure.message}
          handlers={{ retry: actions.failure.retry, refresh: access.reload }}
        />
      ) : null}
      <ListBody access={access} rowActions={actions.rowActions} />
      <RevokeAccessDialog
        target={actions.revoking}
        nodeName={nodeName}
        onConfirm={actions.confirmRevoke}
        onClose={() => actions.setRevoking(null)}
        onRefresh={access.reload}
      />
    </section>
  );
}
