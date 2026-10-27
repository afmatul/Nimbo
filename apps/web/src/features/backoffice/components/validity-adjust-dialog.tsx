'use client';

import {
  BACKOFFICE_ERROR_CODES,
  isCalendarDay,
  type AccountLimits,
  type AdjustValidityRequest,
} from '@nimbo/contracts';
import { Lock } from 'lucide-react';
import * as React from 'react';

import type { ApiClientError } from '../../../lib/api-error';
import { validityNotLaterMessage } from '../../../lib/error-catalog';
import {
  calendarDayLabel,
  dayInputValue,
  lastDayInputValue,
  lastDayLabel,
} from '../../../lib/format-date';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import {
  notLaterIssue,
  serverIssuesOf,
  VALIDITY_FIELD_IDS,
  validityRequestOf,
} from '../limits-form-values';

import {
  FormDialog,
  FormErrorSummary,
  FormField,
  issueFor,
  useFormSubmission,
  type FormIssue,
} from './form-dialog';
import { InfoNote } from './info-note';

export interface ValidityAdjustDialogProps {
  readonly clientName: string;
  /** El `vence_en` actual de un plan de pago. */
  readonly expiresAt: string;
  readonly readOnly: boolean;
  readonly adjust: (request: AdjustValidityRequest) => Promise<AccountLimits>;
  readonly onSaved: (limits: AccountLimits) => void;
  readonly onClose: () => void;
}

/**
 * Lo que el servidor rechazó, en el campo: la forma con su `reason` o, sin `fields`, un día que no extiende (CA-7). Otro
 * rechazo no es del campo: va en el aviso del diálogo.
 */
function rejectionIssues(
  rejection: ApiClientError | null,
  expiresAt: string,
): readonly FormIssue[] {
  if (rejection?.code !== BACKOFFICE_ERROR_CODES.VALIDITY_NOT_EXTENDED) return [];
  const fields = serverIssuesOf(rejection, VALIDITY_FIELD_IDS);
  return fields.length > 0 ? fields : [notLaterIssue(expiresAt)];
}

/** La fecha actual y la nueva, antes de guardar (mockup `extender-vigencia`). */
function ValiditySummary({ expiresAt, day }: { readonly expiresAt: string; readonly day: string }) {
  return (
    <div
      aria-live="polite"
      className="rounded-md border border-border bg-muted px-3.5 py-3 text-sm text-secondary-foreground"
    >
      <p>
        Vence actualmente:{' '}
        <strong className="font-semibold text-foreground">{lastDayLabel(expiresAt)}</strong>. Fecha
        nueva:{' '}
        <strong className="font-semibold text-foreground">
          {isCalendarDay(day) ? calendarDayLabel(day) : '—'}
        </strong>
        .
      </p>
    </div>
  );
}

/** Si la suscripción está en solo lectura, el diálogo lo dice: al guardar vuelve a vigente (decisión 14). */
function ReadOnlyNote(): React.JSX.Element {
  return (
    <InfoNote
      icon={Lock}
      title="La cuenta está en solo lectura."
      text="Al guardar, vuelve a vigente de inmediato y puede subir y editar otra vez."
    />
  );
}

/** Estado del formulario: el día, el campo que no vale y el envío. */
function useValidityForm({ expiresAt, adjust, onSaved }: ValidityAdjustDialogProps) {
  const [day, setDay] = React.useState(() => lastDayInputValue(expiresAt));
  const [issues, setIssues] = React.useState<readonly FormIssue[]>([]);
  const submission = useFormSubmission({ save: adjust, onSaved });
  const serverIssues = React.useMemo(
    () => rejectionIssues(submission.rejection, expiresAt),
    [submission.rejection, expiresAt],
  );
  const submit = (): void => {
    const parsed = validityRequestOf(day, { expiresAt, today: dayInputValue(Date.now()) });
    setIssues('issues' in parsed ? parsed.issues : []);
    if ('request' in parsed) submission.send(parsed.request);
  };
  return { day, setDay, issues: issues.length > 0 ? issues : serverIssues, submission, submit };
}

/** Aviso de un rechazo que no es del campo (red, 404, 403…): el diálogo sigue abierto y nada cambió. */
function OtherRejection({ rejection }: { readonly rejection: ApiClientError | null }) {
  if (rejection === null || rejection.code === BACKOFFICE_ERROR_CODES.VALIDITY_NOT_EXTENDED) {
    return null;
  }
  return <ServerErrorAlert title="No guardamos la vigencia." error={rejection} />;
}

/** El día nuevo; la ayuda dice el último día vigente (spec §6). */
function ValidityField({
  form,
  expiresAt,
}: {
  readonly form: ReturnType<typeof useValidityForm>;
  readonly expiresAt: string;
}): React.JSX.Element {
  const fieldId = VALIDITY_FIELD_IDS.expiresAt;
  return (
    <FormField
      id={fieldId}
      label="Nueva fecha de vencimiento"
      help={`${validityNotLaterMessage(lastDayLabel(expiresAt))} No se cobra ni se factura.`}
      error={issueFor(form.issues, fieldId)}
      input={{
        type: 'date',
        readOnly: form.submission.pending,
        value: form.day,
        onChange: (event) => form.setDay(event.target.value),
      }}
    />
  );
}

/** «Extender vigencia» (011b CA-6, CA-7; mockups `extender-vigencia`, `fecha-no-posterior`). */
export function ValidityAdjustDialog(props: ValidityAdjustDialogProps): React.JSX.Element {
  const form = useValidityForm(props);
  return (
    <FormDialog
      title={`Extender la vigencia de ${props.clientName}`}
      description="La fecha nueva reemplaza a la actual. No registra un cobro ni una factura; la renovación automática y el cambio de plan siguen como están."
      onClose={props.onClose}
      submit={{
        label: 'Guardar vigencia',
        pendingLabel: 'Guardando vigencia…',
        pending: form.submission.pending,
        onSubmit: form.submit,
      }}
    >
      <FormErrorSummary title="Revisa la fecha de vencimiento." issues={form.issues} />
      <OtherRejection rejection={form.submission.rejection} />
      <ValidityField form={form} expiresAt={props.expiresAt} />
      {props.readOnly ? <ReadOnlyNote /> : null}
      <ValiditySummary expiresAt={props.expiresAt} day={form.day} />
    </FormDialog>
  );
}
