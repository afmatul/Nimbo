'use client';

import { STORAGE_ERROR_CODES } from '@nimbo/contracts';
import { TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { StorageRequestError } from '../storage-request-error';

/** `details.suggestedName` de un `409` de archivo (005 CA-6, 006 CA-4 y CA-7); `null` si el error es otro. */
export function suggestedNameOf(error: unknown): string | null {
  if (!(error instanceof StorageRequestError)) return null;
  if (error.code !== STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) return null;
  const suggested = error.details['suggestedName'];
  return typeof suggested === 'string' ? suggested : null;
}

export interface NameConflictChoice {
  readonly applyToRest: boolean;
}

type ChoiceHandler = (choice: NameConflictChoice) => void;

export interface NameConflictDialogProps {
  readonly open: boolean;
  /** Nombre elegido por el usuario, que ya existe en Mis archivos. */
  readonly fileName: string;
  /** `details.suggestedName` del `409`: el servidor calcula el sufijo «(n)» (D-4). */
  readonly finalName: string;
  /** Otros archivos de la misma selección que siguen esperando respuesta (`pendingConflictsInBatch`). */
  readonly othersCount: number;
  readonly onKeepBoth: ChoiceHandler;
  readonly onDiscard: ChoiceHandler;
  /** Solo en cargas (014 CA-1): ofrece «Reemplazar (nueva versión)». Renombrar y mover no reemplazan. */
  readonly onReplace?: ChoiceHandler;
  /** `details.wouldPruneVersion`: versión que eliminaría reemplazar (014 CA-15); `null`, sin aviso. */
  readonly wouldPruneVersion?: number | null;
}

function applyToRestHelp(othersCount: number): string {
  return othersCount === 1
    ? 'Usaremos la misma respuesta para el otro archivo con nombre repetido.'
    : `Usaremos la misma respuesta para los otros ${String(othersCount)} archivos con nombre repetido.`;
}

/** La casilla vuelve a quedar sin marcar cada vez que el diálogo pregunta por otro archivo. */
function useApplyToRest(open: boolean, fileName: string): [boolean, (value: boolean) => void] {
  const [applyToRest, setApplyToRest] = React.useState(false);
  const question = `${String(open)}:${fileName}`;
  const [seenQuestion, setSeenQuestion] = React.useState(question);
  if (seenQuestion !== question) {
    setSeenQuestion(question);
    setApplyToRest(false);
  }
  return [applyToRest, setApplyToRest];
}

/** Ids del texto, la nota y, si lo hay, el aviso de poda para `aria-describedby` (mockup `nombre-repetido-poda`). */
function useDescriptionIds(hasPruneWarning: boolean): {
  readonly description: string;
  readonly note: string;
  readonly prune: string;
  readonly describedBy: string;
} {
  const base = React.useId();
  const ids = { description: `${base}-d`, note: `${base}-n`, prune: `${base}-p` };
  const parts = [ids.description, ids.note, ...(hasPruneWarning ? [ids.prune] : [])];
  return { ...ids, describedBy: parts.join(' ') };
}

const NOTE_CLASS = 'rounded-md bg-muted px-3 py-2.5 text-sm break-words text-secondary-foreground';

function FinalName({ name }: { readonly name: string }): React.JSX.Element {
  return <strong className="font-semibold text-foreground">«{name}»</strong>;
}

/** Nota sobre `muted`: qué hace cada opción. Con «Reemplazar», las dos; sin él, solo «Conservar ambos» (005). */
function ConflictNote({
  id,
  finalName,
  canReplace,
}: {
  readonly id: string;
  readonly finalName: string;
  readonly canReplace: boolean;
}): React.JSX.Element {
  if (!canReplace) {
    return (
      <p id={id} className={NOTE_CLASS}>
        Si conservas ambos, el nuevo se guardará como <FinalName name={finalName} />.
      </p>
    );
  }
  return (
    <ul id={id} className={`${NOTE_CLASS} grid gap-1`}>
      <li>
        <strong className="font-semibold text-foreground">Reemplazar:</strong> el archivo conserva
        su nombre y la versión actual queda en su historial.
      </li>
      <li>
        <strong className="font-semibold text-foreground">Conservar ambos:</strong> el nuevo se
        guardará como <FinalName name={finalName} />.
      </li>
    </ul>
  );
}

/** Aviso de poda (014 CA-15): dice «Al reemplazar» porque «Conservar ambos» no poda nada. */
function PruneWarning({
  id,
  version,
}: {
  readonly id: string;
  readonly version: number;
}): React.JSX.Element {
  const pruned = String(version);
  return (
    <Alert id={id} variant="warning" className="flex gap-2.5">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="block font-semibold">{`Si reemplazas, se eliminará la versión ${pruned}.`}</strong>{' '}
        <span className="text-foreground">{`Al reemplazar se eliminará la versión ${pruned}, la más antigua.`}</span>
      </p>
    </Alert>
  );
}

function ApplyToRestField({
  othersCount,
  checked,
  onChange,
}: {
  readonly othersCount: number;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}): React.JSX.Element | null {
  const helpId = React.useId();
  if (othersCount === 0) return null;
  return (
    <div>
      <Checkbox
        label="Aplicar a los demás"
        aria-describedby={helpId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <p id={helpId} className="pl-8 text-sm text-muted-foreground">
        {applyToRestHelp(othersCount)}
      </p>
    </div>
  );
}

interface ConflictFooterProps {
  readonly onKeepBoth: () => void;
  readonly onDiscard: () => void;
  readonly onReplace: (() => void) | null;
  readonly keepBothRef: React.RefObject<HTMLButtonElement | null>;
}

/** «Cancelar», «Reemplazar (nueva versión)» (`outline`) y «Conservar ambos»; a 360 px se apilan al revés. */
function ConflictFooter({
  onKeepBoth,
  onDiscard,
  onReplace,
  keepBothRef,
}: ConflictFooterProps): React.JSX.Element {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel onClick={onDiscard}>Cancelar</AlertDialogCancel>
      {onReplace ? (
        <AlertDialogAction asChild>
          <Button variant="outline" onClick={onReplace}>
            Reemplazar (nueva versión)
          </Button>
        </AlertDialogAction>
      ) : null}
      <AlertDialogAction ref={keepBothRef} onClick={onKeepBoth}>
        Conservar ambos
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

function ConflictHeader({
  id,
  fileName,
  canReplace,
}: {
  readonly id: string;
  readonly fileName: string;
  readonly canReplace: boolean;
}): React.JSX.Element {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>
        {canReplace ? 'Ya tienes un archivo con este nombre' : '¿Conservar ambos archivos?'}
      </AlertDialogTitle>
      <AlertDialogDescription id={id}>
        {`Ya tienes un archivo llamado «${fileName}». `}
        {canReplace
          ? '¿Quieres reemplazarlo o conservar ambos?'
          : '¿Quieres conservar ambos o cancelar?'}
      </AlertDialogDescription>
    </AlertDialogHeader>
  );
}

/**
 * Un diálogo por archivo con nombre repetido (CA-6). En cargas suma «Reemplazar (nueva versión)» y avisa qué versión
 * se eliminaría (014 CA-1, CA-15). El foco inicial va a «Conservar ambos», que no cambia nada existente. Escape
 * equivale a «Cancelar».
 */
export function NameConflictDialog(props: NameConflictDialogProps): React.JSX.Element {
  const { open, onReplace } = props;
  const [applyToRest, setApplyToRest] = useApplyToRest(open, props.fileName);
  const prune = onReplace ? (props.wouldPruneVersion ?? null) : null;
  const ids = useDescriptionIds(prune !== null);
  const keepBothRef = React.useRef<HTMLButtonElement>(null);
  const choose = (handler: ChoiceHandler) => (): void => handler({ applyToRest });

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        aria-describedby={ids.describedBy}
        className={onReplace ? 'max-w-xl' : undefined}
        onOpenAutoFocus={(event) => focusInstead(event, keepBothRef)}
        onEscapeKeyDown={choose(props.onDiscard)}
      >
        <ConflictBody props={props} ids={ids} prune={prune} />
        <ApplyToRestField
          othersCount={props.othersCount}
          checked={applyToRest}
          onChange={setApplyToRest}
        />
        <ConflictFooter
          onKeepBoth={choose(props.onKeepBoth)}
          onDiscard={choose(props.onDiscard)}
          onReplace={onReplace ? choose(onReplace) : null}
          keepBothRef={keepBothRef}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Radix enfoca el primer botón; aquí el foco inicial va a `ref`. */
function focusInstead(event: Event, ref: React.RefObject<HTMLElement | null>): void {
  event.preventDefault();
  ref.current?.focus();
}

/** Título, texto, nota y, en el límite, el aviso de poda. */
function ConflictBody({
  props,
  ids,
  prune,
}: {
  readonly props: NameConflictDialogProps;
  readonly ids: ReturnType<typeof useDescriptionIds>;
  readonly prune: number | null;
}): React.JSX.Element {
  const canReplace = props.onReplace !== undefined;
  return (
    <>
      <ConflictHeader id={ids.description} fileName={props.fileName} canReplace={canReplace} />
      <ConflictNote id={ids.note} finalName={props.finalName} canReplace={canReplace} />
      {prune === null ? null : <PruneWarning id={ids.prune} version={prune} />}
    </>
  );
}
