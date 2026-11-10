'use client';

import { PUBLIC_LINK_PASSWORD_MAX_LENGTH, SHARING_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
  type RefObject,
} from 'react';

import { PasswordField } from '../../../components/nimbo/password-field';
import { Label } from '../../../components/ui/label';
import type { PublicLinkDownloadOutcome } from '../hooks/use-public-link-visit';
import { publicLinkMessage } from '../public-link-messages';

/** Evita que el visitante la confunda con la de su cuenta de Nimbo (013b CA-2). */
const PASSWORD_HINT = 'No es la de tu cuenta: te la da quien compartió el enlace.';
const PASSWORD_MISSING = 'Escribe la contraseña del enlace.';
const INVALID = publicLinkMessage(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID);
const PASSWORD_INVALID = `${INVALID.title} ${INVALID.description}`;

export interface PublicLinkPasswordFormProps {
  readonly outcome: PublicLinkDownloadOutcome;
  /** «Preparando descarga…»: el envío no hace nada (CA-3). */
  readonly preparing: boolean;
  readonly onDownload: (password: string) => void;
  /** El botón «Descargar» del formulario. */
  readonly submit: ReactNode;
}

/** Tras un `403` el campo queda vacío y con el foco (CA-4); tras un `429`, vacío (CA-5). */
function useClearAfterRejection(
  inputRef: RefObject<HTMLInputElement | null>,
  outcome: PublicLinkDownloadOutcome,
): void {
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    if (outcome.status === 'password-invalid' || outcome.status === 'rate-limited') {
      input.value = '';
    }
    if (outcome.status === 'password-invalid') input.focus();
  }, [inputRef, outcome]);
}

function FieldMessage({ id, children }: { readonly id: string; readonly children: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-sm font-medium text-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

interface PasswordInputProps {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly error: string | null;
}

function PasswordInput({ inputRef, error }: PasswordInputProps): JSX.Element {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Contraseña del enlace</Label>
      <PasswordField
        ref={inputRef}
        id={id}
        name="password"
        autoComplete="off"
        maxLength={PUBLIC_LINK_PASSWORD_MAX_LENGTH}
        error={error !== null}
        aria-describedby={error === null ? hintId : `${errorId} ${hintId}`}
      />
      <p id={hintId} className="text-sm text-muted-foreground">
        {PASSWORD_HINT}
      </p>
      {error === null ? null : <FieldMessage id={errorId}>{error}</FieldMessage>}
    </div>
  );
}

/**
 * Contraseña del enlace antes de «Descargar» (013b CA-2, CA-4): la ficha ya está a la vista (RN-2). Con el campo
 * vacío no envía nada. El valor vive solo en el campo: nunca se guarda en el navegador.
 */
export function PublicLinkPasswordForm({
  outcome,
  preparing,
  onDownload,
  submit,
}: PublicLinkPasswordFormProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState(false);
  useClearAfterRejection(inputRef, outcome);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (preparing) return;
    const password = inputRef.current?.value ?? '';
    setMissing(password === '');
    if (password === '') inputRef.current?.focus();
    else onDownload(password);
  };

  const error = missing
    ? PASSWORD_MISSING
    : outcome.status === 'password-invalid'
      ? PASSWORD_INVALID
      : null;
  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <PasswordInput inputRef={inputRef} error={error} />
      {submit}
    </form>
  );
}
