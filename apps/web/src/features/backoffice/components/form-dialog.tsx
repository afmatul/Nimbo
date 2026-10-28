'use client';

import { AlertCircle, History } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';

import { FieldMessage } from './field-message';

/** Un campo que no vale y su mensaje; el resumen enlaza a `#fieldId`. */
export interface FormIssue {
  readonly fieldId: string;
  readonly message: string;
}

/** El mensaje del campo `fieldId`, si no vale. */
export const issueFor = (issues: readonly FormIssue[], fieldId: string): string | undefined =>
  issues.find((issue) => issue.fieldId === fieldId)?.message;

const AUDIT_NOTE =
  'El ajuste queda en la auditoría del cliente; verá la acción y tu rol, no tu nombre.';

export interface FormSubmit {
  readonly label: string;
  readonly pendingLabel: string;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}

export interface FormDialogProps {
  readonly title: string;
  readonly description: string;
  /** Cancelar o Escape; mientras se envía no se cierra. */
  readonly onClose: () => void;
  readonly submit: FormSubmit;
  readonly children: React.ReactNode;
}

/**
 * Diálogo con un formulario breve (011b; mockup `backoffice/admin`, `A.formDialog`): título, descripción, campos y
 * resumen, aviso de auditoría y «Cancelar»/confirmar. No es una confirmación destructiva: el foco inicial va al primer
 * campo. Se monta abierto; quien lo usa lo desmonta al cerrar, así cada apertura empieza limpia.
 */
export function FormDialog({
  title,
  description,
  onClose,
  submit,
  children,
}: FormDialogProps): React.JSX.Element {
  const onOpenChange = (open: boolean): void => {
    if (!open && !submit.pending) onClose();
  };
  const onFormSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!submit.pending) submit.onSubmit();
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto">
        <form noValidate onSubmit={onFormSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="break-words">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <FormDialogFooter submit={submit} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormDialogFooter({ submit }: { readonly submit: FormSubmit }): React.JSX.Element {
  return (
    <>
      <p className="flex items-start gap-2 text-sm text-secondary-foreground">
        <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {AUDIT_NOTE}
      </p>
      <DialogFooter className="border-t border-border pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={submit.pending}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" loading={submit.pending}>
          {submit.pending ? submit.pendingLabel : submit.label}
        </Button>
      </DialogFooter>
    </>
  );
}

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  readonly error: string | undefined;
  /** Atributos del control (`type`, `value`, `onChange`, `ref`…); el id y la descripción los pone el campo. */
  readonly input: Omit<
    React.ComponentProps<typeof Input>,
    'id' | 'aria-describedby' | 'error' | 'errorMessage'
  >;
  /** Unidad junto al control («GB»). */
  readonly suffix?: string;
}

function FieldSuffix({ suffix }: { readonly suffix: string }): React.JSX.Element {
  return (
    <span className="flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm font-semibold text-secondary-foreground">
      {suffix}
    </span>
  );
}

function FieldControl({
  id,
  describedBy,
  invalid,
  input,
  suffix,
}: {
  readonly id: string;
  readonly describedBy: string;
  readonly invalid: boolean;
  readonly input: FormFieldProps['input'];
  readonly suffix: string | undefined;
}): React.JSX.Element {
  return (
    <>
      <Input
        {...input}
        id={id}
        error={invalid}
        aria-describedby={describedBy}
        className={suffix === undefined ? undefined : 'rounded-r-none'}
      />
      {suffix === undefined ? null : <FieldSuffix suffix={suffix} />}
    </>
  );
}

/** Etiqueta, ayuda, control y error bajo el control, con ícono y texto (mockup `A.campo`). */
export function FormField({
  id,
  label,
  help,
  error,
  input,
  suffix,
}: FormFieldProps): React.JSX.Element {
  const describedBy = error === undefined ? `${id}-ayuda` : `${id}-ayuda ${id}-error`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-secondary-foreground">
        {help}
      </p>
      <div className="mt-1.5 flex max-w-56">
        <FieldControl
          id={id}
          describedBy={describedBy}
          invalid={error !== undefined}
          input={input}
          suffix={suffix}
        />
      </div>
      {error === undefined ? null : <FieldMessage id={`${id}-error`} message={error} />}
    </div>
  );
}

function ErrorSummaryList({
  issues,
}: {
  readonly issues: readonly FormIssue[];
}): React.JSX.Element {
  return (
    <ul className="mt-1.5 list-disc space-y-1 pl-6">
      {issues.map((issue) => (
        <li key={issue.fieldId}>
          <a href={`#${issue.fieldId}`} className="font-medium underline underline-offset-2">
            {issue.message}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Resumen de errores sobre los campos (mockup `A.resumenErrores`): recibe el foco y enlaza a cada campo. */
export function FormErrorSummary({
  title,
  issues,
}: {
  readonly title: string;
  readonly issues: readonly FormIssue[];
}): React.ReactNode {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (issues.length > 0) ref.current?.focus();
  }, [issues]);
  if (issues.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-md border border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {title} Nada cambió.
      </p>
      <ErrorSummaryList issues={issues} />
    </div>
  );
}

export interface FormSubmission<Req> {
  readonly pending: boolean;
  /** Rechazo del último envío: el diálogo sigue abierto con su aviso y nada cambió. */
  readonly rejection: ApiClientError | null;
  readonly send: (request: Req) => void;
}

function savedOrRejection<Res>(
  response: Res,
  onSaved: (response: Res) => void,
): ApiClientError | null {
  try {
    onSaved(response);
    return null;
  } catch (caught: unknown) {
    return toApiClientError(caught);
  }
}

function endSubmission({
  setPending,
  setRejection,
  sending,
  error,
}: {
  readonly setPending: (pending: boolean) => void;
  readonly setRejection: (error: ApiClientError | null) => void;
  readonly sending: React.RefObject<boolean>;
  readonly error: ApiClientError | null;
}): void {
  sending.current = false;
  setPending(false);
  if (error !== null) setRejection(error);
}

/** Envía una vez: un segundo clic mientras sale no dispara otro. El éxito también suelta el botón. */
export function useFormSubmission<Req, Res>({
  save,
  onSaved,
}: {
  readonly save: (request: Req) => Promise<Res>;
  readonly onSaved: (response: Res) => void;
}): FormSubmission<Req> {
  const [pending, setPending] = React.useState(false);
  const [rejection, setRejection] = React.useState<ApiClientError | null>(null);
  const sending = React.useRef(false);
  const send = (request: Req): void => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setRejection(null);
    const settle = { setPending, setRejection, sending };
    void save(request).then(
      (response) => endSubmission({ ...settle, error: savedOrRejection(response, onSaved) }),
      (caught: unknown) => endSubmission({ ...settle, error: toApiClientError(caught) }),
    );
  };
  return { pending, rejection, send };
}
