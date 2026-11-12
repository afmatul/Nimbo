'use client';

import {
  createPublicLinkSchema,
  PUBLIC_LINK_DEFAULT_EXPIRY_DAYS,
  PUBLIC_LINK_EXPIRY_OPTIONS,
  PUBLIC_LINK_PASSWORD_MAX_LENGTH,
  SHARING_ERROR_CODES,
  SHARING_FIELD_MESSAGES,
  type PublicLinkExpiryDays,
} from '@nimbo/contracts';
import { LinkIcon, Loader2 } from 'lucide-react';
import * as React from 'react';

import { FieldMessage } from '../../../components/nimbo/field-message';
import { PasswordField } from '../../../components/nimbo/password-field';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { RadioGroup } from '../../../components/ui/radio-group';
import { usePendingConfirm } from '../../storage/hooks/use-pending-confirm';
import { StorageRequestError } from '../../storage/storage-request-error';
import type { PublicLinkChoice } from '../hooks/use-public-link';
import { isReadOnlyError, publicLinkMessageOf, type ShareMessage } from '../share-messages';
import { publicLinkBody } from '../sharing-api';

import { ShareErrorAlert } from './share-error-alert';

export interface PublicLinkFormProps {
  /** Archivo del enlace: el contrato lo valida junto con lo elegido (plan 013c I-1). */
  readonly fileId: string;
  /** Genera con lo elegido; rechaza con el error de la API. */
  readonly onGenerate: (choice: PublicLinkChoice) => Promise<unknown>;
  readonly onCancel: () => void;
  /** `403` de solo lectura: la sección muestra `ReadOnlyBanner` sobre el formulario, que conserva lo elegido (CA-10). */
  readonly onReadOnly: () => void;
  /** Reemplazo de un enlace sin revocar: el botón dice «Generar otro enlace» (CA-8). */
  readonly replacing?: boolean;
}

/** Ayuda de la contraseña (spec 013c §5): opcional, su longitud y que no sea la de la cuenta (R-3). */
const PASSWORD_HINT =
  'Si la pones, se pedirá para descargar. De 8 a 128 caracteres. No uses la de tu cuenta y compártela por otro medio.';
const GENERATING_LABEL = 'Generando…';

const EXPIRY_OPTIONS = PUBLIC_LINK_EXPIRY_OPTIONS.map((days) => ({
  value: String(days),
  label: days === 1 ? '1 día' : `${days} días`,
}));

const expiryOf = (value: string): PublicLinkExpiryDays =>
  PUBLIC_LINK_EXPIRY_OPTIONS.find((days) => String(days) === value) ??
  PUBLIC_LINK_DEFAULT_EXPIRY_DAYS;

/** Error de la contraseña junto al campo (CA-5, I-5) o aviso con su acción (CA-12, CA-13). */
type FormFailure =
  | { readonly kind: 'password'; readonly text: string }
  | { readonly kind: 'notice'; readonly message: ShareMessage };

/** El `422` de la API por la contraseña se muestra como el error local (CA-5). */
function describeFailure(error: unknown): FormFailure {
  const rejectsPassword =
    error instanceof StorageRequestError &&
    error.code === SHARING_ERROR_CODES.SHARING_INVALID_REQUEST &&
    error.fields.some((issue) => issue.reason === 'INVALID_PASSWORD');
  return rejectsPassword
    ? { kind: 'password', text: SHARING_FIELD_MESSAGES.INVALID_PASSWORD }
    : { kind: 'notice', message: publicLinkMessageOf(error) };
}

/** Texto del contrato si la contraseña no cumple; vacía no cuenta, porque `publicLinkBody` la omite (CA-4). */
function passwordIssueOf(fileId: string, choice: PublicLinkChoice): string | null {
  const parsed = createPublicLinkSchema.safeParse(publicLinkBody({ fileId, ...choice }));
  if (parsed.success) return null;
  return parsed.error.issues.find((issue) => issue.path[0] === 'password')?.message ?? null;
}

/** Envía lo elegido; el `403` de solo lectura no es un fallo del formulario: lo muestra la sección (CA-10). */
function useGenerate(props: PublicLinkFormProps, choice: PublicLinkChoice, onSent: () => void) {
  const send = async (): Promise<void> => {
    try {
      await props.onGenerate(choice);
      onSent();
    } catch (error) {
      if (!isReadOnlyError(error)) throw error;
      props.onReadOnly();
    }
  };
  return usePendingConfirm(send, () => undefined, describeFailure);
}

/** Lo elegido vive solo aquí; la contraseña se borra al generar (spec §5). Ante un error se conserva todo. */
function usePublicLinkForm(
  props: PublicLinkFormProps,
  passwordRef: React.RefObject<HTMLInputElement | null>,
) {
  const [expiresInDays, setExpiresInDays] = React.useState(PUBLIC_LINK_DEFAULT_EXPIRY_DAYS);
  const [password, setPassword] = React.useState('');
  const [invalid, setInvalid] = React.useState<string | null>(null);
  const pending = useGenerate(props, { expiresInDays, password }, () => setPassword(''));
  const submit = (): void => {
    const issue = passwordIssueOf(props.fileId, { expiresInDays, password });
    setInvalid(issue);
    if (issue === null) void pending.confirm();
    else passwordRef.current?.focus();
  };
  return { expiresInDays, setExpiresInDays, password, setPassword, invalid, pending, submit };
}

type PublicLinkFormState = ReturnType<typeof usePublicLinkForm>;

/** El error local o el `422` de la API, siempre junto al campo (CA-5, I-5). */
function passwordErrorOf({ invalid, pending }: PublicLinkFormState): string | null {
  return invalid ?? (pending.failure?.kind === 'password' ? pending.failure.text : null);
}

/** El rechazo de la API por la contraseña lleva el foco al campo, como el error local (CA-5). */
function useFocusOnPasswordRejection(
  passwordRef: React.RefObject<HTMLInputElement | null>,
  failure: FormFailure | null,
): void {
  React.useEffect(() => {
    if (failure?.kind === 'password') passwordRef.current?.focus();
  }, [passwordRef, failure]);
}

interface PasswordInputProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (password: string) => void;
}

/**
 * «Contraseña (opcional)»: ni el navegador ni los gestores la rellenan con la de la cuenta ni ofrecen guardarla
 * (`off`, nombre propio y las marcas de 1Password y LastPass; R-3, SEC-1 de la T-08).
 */
function PasswordInput({
  inputRef,
  value,
  error,
  onChange,
}: PasswordInputProps): React.JSX.Element {
  const id = React.useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Contraseña (opcional)</Label>
      <PasswordField
        ref={inputRef}
        id={id}
        name="enlace-contrasena"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        maxLength={PUBLIC_LINK_PASSWORD_MAX_LENGTH}
        value={value}
        error={error !== null}
        aria-describedby={error === null ? hintId : `${errorId} ${hintId}`}
        onChange={(event) => onChange(event.target.value)}
      />
      {error === null ? null : (
        <FieldMessage id={errorId} alert>
          {error}
        </FieldMessage>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {PASSWORD_HINT}
      </p>
    </div>
  );
}

interface FormActionsProps {
  readonly form: PublicLinkFormState;
  readonly label: string;
  readonly onCancel: () => void;
}

const SUBMIT_CLASS = 'w-full aria-disabled:cursor-progress sm:w-auto';

/** «Generar enlace»; pasados 2 s, «Generando…» con `aria-disabled` (conserva el foco) y anuncio (CA-3). */
function FormActions({ form, label, onCancel }: FormActionsProps): React.JSX.Element {
  const { pending, slow } = form.pending;
  const Icon = slow ? Loader2 : LinkIcon;
  const iconClass = slow ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4';
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" className={SUBMIT_CLASS} aria-disabled={slow || undefined}>
        <Icon aria-hidden="true" className={iconClass} />
        {slow ? GENERATING_LABEL : label}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={onCancel}
      >
        Cancelar
      </Button>
      <p role="status" className="sr-only">
        {slow ? GENERATING_LABEL : ''}
      </p>
    </div>
  );
}

interface ExpiryFieldProps {
  readonly value: PublicLinkExpiryDays;
  readonly onChange: (days: PublicLinkExpiryDays) => void;
}

/** «Vence en» (D-4); al abrirse, el foco va a la opción marcada (CA-8, CA-15). */
function ExpiryField({ value, onChange }: ExpiryFieldProps): React.JSX.Element {
  const groupRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    groupRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, []);
  return (
    <div ref={groupRef}>
      <RadioGroup
        name="enlace-vence"
        legend="Vence en"
        options={EXPIRY_OPTIONS}
        value={String(value)}
        onValueChange={(option) => onChange(expiryOf(option))}
      />
    </div>
  );
}

/** El `429` en advertencia, sin botón (CA-12); la red o un 5xx con «Reintentar» (CA-13). */
function FormNotice({ form }: { readonly form: PublicLinkFormState }): React.JSX.Element | null {
  const failure = form.pending.failure;
  if (failure?.kind !== 'notice') return null;
  return (
    <ShareErrorAlert
      message={failure.message}
      handlers={{ retry: form.submit }}
      variant={failure.message.fix === 'wait' ? 'warning' : 'error'}
    />
  );
}

/**
 * Formulario del enlace público (spec 013c CA-3 a CA-5, CA-12): «Vence en» 1, 7 o 30 días y «Contraseña (opcional)».
 * La contraseña inválida se marca solo junto al campo; el `429` va en advertencia y la red con «Reintentar».
 */
export function PublicLinkForm(props: PublicLinkFormProps): React.JSX.Element {
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const form = usePublicLinkForm(props, passwordRef);
  useFocusOnPasswordRejection(passwordRef, form.pending.failure);
  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    form.submit();
  };
  return (
    <form noValidate aria-label="Nuevo enlace público" className="space-y-3" onSubmit={onSubmit}>
      <ExpiryField value={form.expiresInDays} onChange={form.setExpiresInDays} />
      <PasswordInput
        inputRef={passwordRef}
        value={form.password}
        error={passwordErrorOf(form)}
        onChange={form.setPassword}
      />
      <FormNotice form={form} />
      <FormActions
        form={form}
        label={props.replacing ? 'Generar otro enlace' : 'Generar enlace'}
        onCancel={props.onCancel}
      />
    </form>
  );
}
