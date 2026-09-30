'use client';

import * as React from 'react';

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
import { Checkbox } from '../../../components/ui/checkbox';

export interface NameConflictChoice {
  readonly applyToRest: boolean;
}

export interface NameConflictDialogProps {
  readonly open: boolean;
  /** Nombre elegido por el usuario, que ya existe en Mis archivos. */
  readonly fileName: string;
  /** `details.suggestedName` del `409`: el servidor calcula el sufijo «(n)» (D-4). */
  readonly finalName: string;
  /** Otros archivos de la misma selección que siguen esperando respuesta (`pendingConflictsInBatch`). */
  readonly othersCount: number;
  readonly onKeepBoth: (choice: NameConflictChoice) => void;
  readonly onDiscard: (choice: NameConflictChoice) => void;
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

/** Un diálogo por archivo con nombre repetido (CA-6). Escape equivale a «Cancelar». */
export function NameConflictDialog({
  open,
  fileName,
  finalName,
  othersCount,
  onKeepBoth,
  onDiscard,
}: NameConflictDialogProps): React.JSX.Element {
  const [applyToRest, setApplyToRest] = useApplyToRest(open, fileName);
  const keepBothRef = React.useRef<HTMLButtonElement>(null);
  const helpId = React.useId();
  const discard = (): void => onDiscard({ applyToRest });

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keepBothRef.current?.focus();
        }}
        onEscapeKeyDown={discard}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>¿Conservar ambos archivos?</AlertDialogTitle>
          <AlertDialogDescription>
            Ya tienes un archivo llamado «{fileName}». ¿Quieres conservar ambos o cancelar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="rounded-md bg-muted px-3 py-2.5 text-sm break-words text-secondary-foreground">
          Si conservas ambos, el nuevo se guardará como{' '}
          <strong className="font-semibold text-foreground">«{finalName}»</strong>.
        </p>
        {othersCount > 0 ? (
          <div>
            <Checkbox
              label="Aplicar a los demás"
              aria-describedby={helpId}
              checked={applyToRest}
              onChange={(event) => setApplyToRest(event.target.checked)}
            />
            <p id={helpId} className="pl-8 text-sm text-muted-foreground">
              {applyToRestHelp(othersCount)}
            </p>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={discard}>Cancelar</AlertDialogCancel>
          <AlertDialogAction ref={keepBothRef} onClick={() => onKeepBoth({ applyToRest })}>
            Conservar ambos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
