'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { JSX } from 'react';
import { useWatch } from 'react-hook-form';

import { TextLink } from '../../../components/nimbo/text-link';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { messageForCode } from '../../../lib/error-catalog';
import {
  useChangePasswordForm,
  type ChangePasswordFormDeps,
  type ChangePasswordFormState,
  type ChangePasswordOutcome,
} from '../hooks/use-change-password-form';

import { FieldError } from './field-error';
import { RESET_PASSWORD_HREF } from './login-alert';
import { PasswordField } from './password-field';
import { PasswordRequirements } from './password-requirements';
import { ServerErrorAlert } from './server-error-alert';

const TITLE_ID = 'cambiar-contrasena';
const CHANGE_ERROR_TITLE = 'No pudimos cambiar tu contraseña.';
const CHANGED_MESSAGE = 'Cambiamos tu contraseña y cerramos tus otras sesiones.';

export type ChangePasswordFormProps = ChangePasswordFormDeps;

/** Resultado del envío dentro de la tarjeta: éxito (`status`), bloqueo o error inesperado (`alert`). */
function OutcomeAlert({
  outcome,
}: {
  readonly outcome: ChangePasswordOutcome;
}): JSX.Element | null {
  if (outcome.kind === 'idle') return null;
  if (outcome.kind === 'changed') {
    return (
      <Alert variant="success" className="flex items-start gap-2">
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"
        />
        <p>{CHANGED_MESSAGE}</p>
      </Alert>
    );
  }
  const { error } = outcome;
  if (error.code !== IDENTITY_ERROR_CODES.PASSWORD_CHANGE_LOCKED) {
    return <ServerErrorAlert title={CHANGE_ERROR_TITLE} error={error} />;
  }
  return (
    <Alert variant="error" className="flex items-start gap-2" data-state="contrasena-bloqueada">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{messageForCode(error.code, { retryAfterSeconds: error.retryAfterSeconds })}</p>
    </Alert>
  );
}

function CurrentPasswordField({ state }: { readonly state: ChangePasswordFormState }): JSX.Element {
  const { register, formState } = state.form;
  const error = formState.errors.currentPassword?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="currentPassword">Contraseña actual</Label>
      <PasswordField
        id="currentPassword"
        autoComplete="current-password"
        readOnly={state.submitting}
        error={error !== undefined}
        aria-describedby={error === undefined ? 'current-help' : 'current-error current-help'}
        {...register('currentPassword')}
      />
      <FieldError id="current-error" message={error} />
      <p id="current-help" className="text-xs">
        <TextLink href={RESET_PASSWORD_HREF}>¿No la recuerdas? Restablece tu contraseña</TextLink>
      </p>
    </div>
  );
}

function WeakReasons({ reasons }: { readonly reasons: readonly string[] }): JSX.Element | null {
  if (reasons.length === 0) return null;
  return (
    <ul className="list-inside list-disc text-xs text-destructive">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

function NewPasswordField({ state }: { readonly state: ChangePasswordFormState }): JSX.Element {
  const { register, formState, control } = state.form;
  const newPassword = useWatch({ control, name: 'newPassword' });
  const error = formState.errors.newPassword?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="newPassword">Contraseña nueva</Label>
      <PasswordField
        id="newPassword"
        autoComplete="new-password"
        readOnly={state.submitting}
        error={error !== undefined}
        aria-describedby={error === undefined ? undefined : 'new-password-error'}
        {...register('newPassword')}
      />
      <FieldError id="new-password-error" message={error} />
      <WeakReasons reasons={state.weakReasons} />
      <PasswordRequirements password={newPassword} email="" />
    </div>
  );
}

function ConfirmPasswordField({ state }: { readonly state: ChangePasswordFormState }): JSX.Element {
  const { register, formState } = state.form;
  const error = formState.errors.confirmPassword?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="confirmPassword">Confirma la contraseña nueva</Label>
      <PasswordField
        id="confirmPassword"
        autoComplete="new-password"
        readOnly={state.submitting}
        error={error !== undefined}
        aria-describedby={error === undefined ? undefined : 'confirm-password-error'}
        {...register('confirmPassword')}
      />
      <FieldError id="confirm-password-error" message={error} />
    </div>
  );
}

function SubmitButton({ submitting }: { readonly submitting: boolean }): JSX.Element {
  return (
    <div className="flex justify-end">
      <Button type="submit" className="w-full sm:w-auto" loading={submitting}>
        {submitting ? 'Cambiando contraseña…' : 'Cambiar contraseña'}
      </Button>
      {submitting ? (
        <span className="sr-only" role="status">
          Cambiando tu contraseña…
        </span>
      ) : null}
    </div>
  );
}

/** Tarjeta «Cambiar contraseña» de Seguridad (spec 002 §11, mockup `identity/seguridad`, CA-22, CA-23). */
export function ChangePasswordForm(props: ChangePasswordFormProps): JSX.Element {
  const state = useChangePasswordForm(props);
  return (
    <section aria-labelledby={TITLE_ID}>
      <Card>
        <CardHeader>
          <h2 id={TITLE_ID} className="text-lg font-semibold text-foreground">
            Cambiar contraseña
          </h2>
          <CardDescription>
            Al cambiarla cerraremos tus otras sesiones. Esta seguirá abierta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OutcomeAlert outcome={state.outcome} />
          <form className="space-y-4" onSubmit={(event) => void state.submit(event)} noValidate>
            <CurrentPasswordField state={state} />
            <NewPasswordField state={state} />
            <ConfirmPasswordField state={state} />
            <SubmitButton submitting={state.submitting} />
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
