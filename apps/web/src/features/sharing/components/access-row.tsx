'use client';

import { SHARE_LEVELS, type AccessEntry, type ShareLevel } from '@nimbo/contracts';
import { UserMinus } from 'lucide-react';
import type * as React from 'react';

import { ParticipantAvatar } from '../../../components/nimbo/participant-avatar';
import { Button } from '../../../components/ui/button';
import { useReadOnlyAccount } from '../../storage/components/space-provider';
import { LEVEL_LABELS } from '../share-levels';

export type DirectAccess = Extract<AccessEntry, { origin: 'direct' }>;
type InheritedAccess = Extract<AccessEntry, { origin: 'inherited' }>;

export interface DirectAccessActions {
  readonly onChangeLevel: (entry: DirectAccess, level: ShareLevel) => void;
  readonly onRevoke: (entry: DirectAccess) => void;
  /** El nivel de esta persona se está cambiando. */
  readonly changingId: string | null;
}

const SELECT_CLASS =
  'h-11 rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45 sm:h-9';

/** En solo lectura solo se ofrece bajar a Lector (spec 012b CA-4): subir a Editor queda deshabilitado. */
function LevelSelect({
  entry,
  actions,
}: {
  readonly entry: DirectAccess;
  readonly actions: DirectAccessActions;
}): React.JSX.Element {
  const { readOnly } = useReadOnlyAccount();
  const changing = actions.changingId === entry.shareId;
  return (
    <select
      aria-label={`Nivel de ${entry.grantee.displayName}`}
      className={SELECT_CLASS}
      value={entry.level}
      disabled={changing}
      aria-busy={changing || undefined}
      onChange={(event) => actions.onChangeLevel(entry, event.target.value as ShareLevel)}
    >
      {SHARE_LEVELS.map((level) => (
        <option
          key={level}
          value={level}
          disabled={readOnly && level === 'EDITOR' && entry.level !== 'EDITOR'}
        >
          {LEVEL_LABELS[level]}
        </option>
      ))}
    </select>
  );
}

function Person({ entry, origin }: { readonly entry: AccessEntry; readonly origin: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <ParticipantAvatar userId={entry.grantee.id} name={entry.grantee.displayName} viewer />
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-foreground">
          {entry.grantee.displayName}
        </p>
        <p className="break-all text-xs text-secondary-foreground">{entry.grantee.email}</p>
        <p className="text-xs text-secondary-foreground">{origin}</p>
      </div>
    </div>
  );
}

const ROW_CLASS = 'flex flex-wrap items-center gap-x-3 gap-y-2 py-3';

/** Acceso directo: nivel editable y «Quitar acceso» (CA-4, CA-5). */
export function DirectAccessRow({
  entry,
  actions,
}: {
  readonly entry: DirectAccess;
  readonly actions: DirectAccessActions;
}): React.JSX.Element {
  return (
    <li className={ROW_CLASS}>
      <Person entry={entry} origin="Acceso directo" />
      <div className="flex items-center gap-1">
        <LevelSelect entry={entry} actions={actions} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Quitar acceso de ${entry.grantee.displayName}`}
          onClick={() => actions.onRevoke(entry)}
        >
          <UserMinus className="h-5 w-5 text-secondary-foreground" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/** Acceso heredado: nivel en texto y la carpeta desde la que se quita, sin botón (CA-5, RN-4 de la 012). */
export function InheritedAccessRow({
  entry,
}: {
  readonly entry: InheritedAccess;
}): React.JSX.Element {
  const origin = `Viene de «${entry.inheritedFrom.folderName}». Quita el acceso desde esa carpeta.`;
  return (
    <li className={ROW_CLASS}>
      <Person entry={entry} origin={origin} />
      <span className="text-sm text-secondary-foreground">{LEVEL_LABELS[entry.level]}</span>
    </li>
  );
}
