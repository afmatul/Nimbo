'use client';

import {
  AUDIT_NOTE_MAX_LENGTH,
  BACKOFFICE_FIELD_MESSAGES,
  STORAGE_ERROR_CODES,
  type RestoreResponse,
  type TrashItem,
} from '@nimbo/contracts';
import * as React from 'react';

import { FieldMessage } from '../../../components/nimbo/field-message';
import { Alert } from '../../../components/ui/alert';
import { Label } from '../../../components/ui/label';
import type { ApiClientError } from '../../../lib/api-error';
import { cn } from '../../../lib/utils';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import { depthExceededText, locationText } from '../trash-notices';

import { FormDialog, FormErrorSummary, useFormSubmission } from './form-dialog';

const NOTE_ID = 'motivo-restauracion';
const REJECTION_TITLE = 'No pudimos restaurar.';

/** Mensaje del catálogo si el motivo no vale (vacío tras recortar o de más de 500 caracteres); `null` si vale (CA-11). */
function noteIssueOf(note: string): string | null {
  const length = note.trim().length;
  if (length === 0) return BACKOFFICE_FIELD_MESSAGES.NOTE_REQUIRED;
  return length > AUDIT_NOTE_MAX_LENGTH ? BACKOFFICE_FIELD_MESSAGES.NOTE_TOO_LONG : null;
}

export interface TrashRestoreDialogProps {
  readonly item: TrashItem;
  /** Nombre de pila del cliente: el aviso dice de quién es la auditoría. */
  readonly clientFirstName: string;
  /** Restaura la raíz con el motivo; `null` si ya no está disponible. Quien abre el diálogo lo interpreta (`onDone`). */
  readonly restore: (note: string) => Promise<RestoreResponse | null>;
  readonly onDone: (result: RestoreResponse | null) => void;
  readonly onClose: () => void;
}

const kindWord = (item: TrashItem): string =>
  item.type === 'folder' ? 'La carpeta' : 'El archivo';

function destinationText(item: TrashItem): string {
  const place = locationText(item.originalFolder?.name);
  return `${kindWord(item)} volverá a «${place}». Si ya existe uno con ese nombre, se restaurará con un número entre paréntesis.`;
}

/**
 * Contador `n/500` del motivo recortado, el mismo largo que se valida y se envía; en rojo y negrita si se pasa (mockup
 * `papelera-motivo-invalido`).
 */
function NoteCounter({ value }: { readonly value: string }): React.JSX.Element {
  const length = value.trim().length;
  const over = length > AUDIT_NOTE_MAX_LENGTH;
  return (
    <p
      className={cn(
        'mt-1 text-right text-xs tabular-nums',
        over ? 'font-semibold text-destructive' : 'text-secondary-foreground',
      )}
    >
      {`${String(length)}/${String(AUDIT_NOTE_MAX_LENGTH)}`}
    </p>
  );
}

interface NoteFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: string | null;
  readonly locked: boolean;
}

/** Campo del motivo (mockup `A.campo`): etiqueta, ayuda, área de texto, contador y error con ícono y texto. */
function NoteField({ value, onChange, error, locked }: NoteFieldProps): React.JSX.Element {
  return (
    <div>
      <Label htmlFor={NOTE_ID}>Motivo de la restauración</Label>
      <p id={`${NOTE_ID}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        {`Obligatorio, de 1 a ${String(AUDIT_NOTE_MAX_LENGTH)} caracteres. Se guarda en la actividad del cliente; no escribas nombres de archivo ni datos personales.`}
      </p>
      <textarea
        id={NOTE_ID}
        rows={3}
        readOnly={locked}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error === null ? undefined : 'true'}
        aria-describedby={`${NOTE_ID}-ayuda${error === null ? '' : ` ${NOTE_ID}-error`}`}
        className={cn(
          'mt-1.5 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          error !== null && 'border-destructive focus-visible:ring-destructive',
        )}
      />
      <NoteCounter value={value} />
      {error === null ? null : (
        <FieldMessage id={`${NOTE_ID}-error`} className="mt-1.5">
          {error}
        </FieldMessage>
      )}
    </div>
  );
}

/**
 * Un `422` de profundidad dice qué pasó y que solo el cliente puede mover la carpeta original (CA-12, CA-17); el resto,
 * con el mensaje del catálogo.
 */
function RestoreRejection({
  error,
  item,
  clientFirstName,
}: {
  readonly error: ApiClientError;
  readonly item: TrashItem;
  readonly clientFirstName: string;
}): React.JSX.Element {
  if (error.code !== STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED)
    return <ServerErrorAlert title={REJECTION_TITLE} error={error} />;
  const maxDepth = String(error.details['maxDepth'] ?? '');
  return (
    <Alert variant="error">
      <strong className="font-semibold">{REJECTION_TITLE}</strong>{' '}
      {depthExceededText(item, maxDepth, clientFirstName)}
    </Alert>
  );
}

/** Estado del formulario: el motivo, su error y el envío. Un motivo que no vale no llega a la API (el resumen recibe el foco). */
function useRestoreForm({ restore, onDone }: TrashRestoreDialogProps) {
  const [note, setNote] = React.useState('');
  const [issue, setIssue] = React.useState<string | null>(null);
  const submission = useFormSubmission({ save: restore, onSaved: onDone });
  const submit = (): void => {
    const found = noteIssueOf(note);
    setIssue(found);
    if (found === null) submission.send(note.trim());
  };
  return { note, setNote, issue, submission, submit };
}

/**
 * «Restaurar «nombre»» (011b CA-11, CA-12; mockups `papelera-confirmar`, `papelera-motivo-invalido`,
 * `papelera-restaurando`): destino, motivo obligatorio y aviso de auditoría. No es destructivo: restaurar no borra nada.
 */
export function TrashRestoreDialog(props: TrashRestoreDialogProps): React.JSX.Element {
  const form = useRestoreForm(props);
  const { item, clientFirstName } = props;
  const { rejection, pending } = form.submission;
  return (
    <FormDialog
      title={`Restaurar «${item.name}»`}
      description={destinationText(item)}
      onClose={props.onClose}
      auditNote={`El motivo queda en la auditoría de ${clientFirstName}. Verá la fecha, el motivo y tu rol (Soporte), no tu nombre.`}
      submit={{ label: 'Restaurar', pendingLabel: 'Restaurando…', pending, onSubmit: form.submit }}
    >
      <FormErrorSummary
        title="Escribe un motivo para restaurar."
        issues={form.issue === null ? [] : [{ fieldId: NOTE_ID, message: form.issue }]}
      />
      {rejection === null ? null : (
        <RestoreRejection error={rejection} item={item} clientFirstName={clientFirstName} />
      )}
      <NoteField value={form.note} onChange={form.setNote} error={form.issue} locked={pending} />
    </FormDialog>
  );
}
