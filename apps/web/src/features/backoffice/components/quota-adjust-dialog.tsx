'use client';

import {
  BACKOFFICE_ERROR_CODES,
  type AccountLimits,
  type AdjustQuotaRequest,
} from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import type { ApiClientError } from '../../../lib/api-error';
import { quotaBelowUsageMessage } from '../../../lib/error-catalog';
import { dayInputValue } from '../../../lib/format-date';
import { formatPlanBytes } from '../../../lib/format-plan';
import { cn } from '../../../lib/utils';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import {
  extraBytesOf,
  initialQuotaValues,
  QUOTA_FIELD_IDS,
  quotaRequestOf,
  resultingTotal,
  serverIssuesOf,
  usedPercent,
  type QuotaValues,
} from '../limits-form-values';

import {
  FormDialog,
  FormErrorSummary,
  FormField,
  issueFor,
  useFormSubmission,
  type FormIssue,
} from './form-dialog';

export interface QuotaAdjustDialogProps {
  readonly clientName: string;
  /** Límites de una cuenta con suscripción: base y total no son `null`. */
  readonly limits: AccountLimits;
  readonly adjust: (request: AdjustQuotaRequest) => Promise<AccountLimits>;
  readonly onSaved: (limits: AccountLimits) => void;
  readonly onClose: () => void;
}

const isBelowUsage = (rejection: ApiClientError | null): rejection is ApiClientError =>
  rejection?.code === BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE;

function calculationClass(below: boolean): string {
  return cn(
    'rounded-md border px-3.5 py-3 text-sm text-secondary-foreground',
    below ? 'border-destructive-soft bg-destructive/5' : 'border-border bg-muted',
  );
}

function QuotaEquation({
  base,
  extraLabel,
  total,
  strong,
}: {
  readonly base: string;
  readonly extraLabel: string;
  readonly total: string;
  readonly strong: string;
}): React.JSX.Element {
  return (
    <p>
      Cuota del plan <strong className={strong}>{formatPlanBytes(base)}</strong> + extra{' '}
      <strong className={strong}>{extraLabel}</strong> ={' '}
      <strong className={strong}>{formatPlanBytes(total)}</strong>.
    </p>
  );
}

/** El total resultante antes de guardar (RN-8, decisión 13): `plan + extra = total` y lo que la cuenta usa. */
function QuotaCalculation({
  limits,
  extra,
}: {
  readonly limits: AccountLimits;
  readonly extra: string;
}): React.JSX.Element {
  const base = limits.baseQuotaBytes ?? '0';
  const extraBytes = extraBytesOf(extra);
  const total = resultingTotal(base, extraBytes);
  const below = BigInt(total) < BigInt(limits.usedBytes);
  const strong = cn('font-semibold', below ? 'text-destructive' : 'text-foreground');
  const extraLabel = `${extraBytes === null ? '0' : extra.trim()} GB`;
  return (
    <div aria-live="polite" className={calculationClass(below)}>
      <QuotaEquation base={base} extraLabel={extraLabel} total={total} strong={strong} />
      <p className="mt-1">
        La cuenta usa <strong className={strong}>{formatPlanBytes(limits.usedBytes)}</strong> (
        {usedPercent(limits.usedBytes, total)} %).
      </p>
    </div>
  );
}

/** Rechazo del servidor que no es de un campo: bajo lo usado (con las dos cifras) o el aviso del catálogo. */
function QuotaRejection({
  rejection,
  baseBytes,
}: {
  readonly rejection: ApiClientError | null;
  readonly baseBytes: string;
}): React.ReactNode {
  if (rejection === null || rejection.fields.length > 0) return null;
  if (!isBelowUsage(rejection)) {
    return <ServerErrorAlert title="No guardamos la cuota." error={rejection} />;
  }
  const total = String(rejection.details['totalQuotaBytes'] ?? baseBytes);
  const extra = formatPlanBytes((BigInt(total) - BigInt(baseBytes)).toString());
  return (
    <Alert variant="error" className="flex items-start gap-2.5">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {quotaBelowUsageMessage(String(rejection.details['usedBytes'] ?? '0'))}
        </p>
        <p className="text-secondary-foreground">
          {`Con ${extra} extra, la cuota total sería ${formatPlanBytes(total)}. Nada cambió.`}
        </p>
      </div>
    </Alert>
  );
}

interface QuotaFieldsProps {
  readonly values: QuotaValues;
  readonly onChange: (values: QuotaValues) => void;
  readonly issues: readonly FormIssue[];
  readonly locked: boolean;
  readonly extraRef: React.RefObject<HTMLInputElement | null>;
}

function ExtraField({
  values,
  onChange,
  issues,
  locked,
  extraRef,
}: QuotaFieldsProps): React.JSX.Element {
  return (
    <FormField
      id={QUOTA_FIELD_IDS.extraBytes}
      label="Espacio extra"
      help="Se suma a la cuota del plan mientras esté vigente. Debe ser mayor que cero."
      error={issueFor(issues, QUOTA_FIELD_IDS.extraBytes)}
      suffix="GB"
      input={{
        ref: extraRef,
        inputMode: 'numeric',
        autoComplete: 'off',
        readOnly: locked,
        value: values.extra,
        onChange: (event) => onChange({ ...values, extra: event.target.value }),
      }}
    />
  );
}

function UntilField({ values, onChange, issues, locked }: QuotaFieldsProps): React.JSX.Element {
  return (
    <FormField
      id={QUOTA_FIELD_IDS.until}
      label="Vigente hasta"
      help="La cuota vuelve a la del plan al terminar este día, sin borrar archivos."
      error={issueFor(issues, QUOTA_FIELD_IDS.until)}
      input={{
        type: 'date',
        readOnly: locked,
        value: values.until,
        onChange: (event) => onChange({ ...values, until: event.target.value }),
      }}
    />
  );
}

function QuotaFields(props: QuotaFieldsProps): React.JSX.Element {
  return (
    <>
      <ExtraField {...props} />
      <UntilField {...props} />
    </>
  );
}

/** Estado del formulario: los valores, los campos que no valen y el envío. */
function useQuotaForm({ limits, adjust, onSaved }: QuotaAdjustDialogProps) {
  const [values, setValues] = React.useState<QuotaValues>(() => initialQuotaValues(limits));
  const [issues, setIssues] = React.useState<readonly FormIssue[]>([]);
  const submission = useFormSubmission({ save: adjust, onSaved });
  const extraRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (isBelowUsage(submission.rejection)) extraRef.current?.focus();
  }, [submission.rejection]);
  const submit = (): void => {
    const parsed = quotaRequestOf(values, dayInputValue(Date.now()));
    setIssues('issues' in parsed ? parsed.issues : []);
    if ('request' in parsed) submission.send(parsed.request);
  };
  const serverIssues = React.useMemo(
    () => serverIssuesOf(submission.rejection, QUOTA_FIELD_IDS),
    [submission.rejection],
  );
  const shown = issues.length > 0 ? issues : serverIssues;
  return { values, setValues, issues: shown, submission, extraRef, submit };
}

/** «Ajustar cuota» (011b CA-1 a CA-3; mockups `ajustar-cuota`, `cuota-bajo-lo-usado`, `cuota-invalida`). */
export function QuotaAdjustDialog(props: QuotaAdjustDialogProps): React.JSX.Element {
  const form = useQuotaForm(props);
  return (
    <FormDialog
      title={`Ajustar cuota de ${props.clientName}`}
      description="El espacio extra se suma al plan y vence en la fecha indicada. No cambia el plan ni el precio."
      onClose={props.onClose}
      submit={{
        label: 'Guardar cuota',
        pendingLabel: 'Guardando cuota…',
        pending: form.submission.pending,
        onSubmit: form.submit,
      }}
    >
      <FormErrorSummary title="Revisa los datos de la cuota." issues={form.issues} />
      <QuotaRejection
        rejection={form.submission.rejection}
        baseBytes={props.limits.baseQuotaBytes ?? '0'}
      />
      <QuotaFields
        values={form.values}
        onChange={form.setValues}
        issues={form.issues}
        locked={form.submission.pending}
        extraRef={form.extraRef}
      />
      <QuotaCalculation limits={props.limits} extra={form.values.extra} />
    </FormDialog>
  );
}
