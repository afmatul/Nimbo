'use client';

import { KeyRound } from 'lucide-react';
import type { JSX } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { IdentityCard } from '../../../../components/nimbo/identity-card';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { FieldError } from '../../components/field-error';
import { PasswordField } from '../../components/password-field';
import { PasswordRequirements } from '../../components/password-requirements';
import { ServerErrorAlert } from '../../components/server-error-alert';
import {
  useAccountSetupForm,
  weakPasswordReasons,
  type AccountSetupFormOptions,
  type AccountSetupFormValues,
} from '../hooks/use-account-setup-form';

import { SETUP_TITLE_ID } from './setup-status-cards';

const SETUP_ERROR_TITLE = 'No pudimos crear tu contraseña.';

interface FieldProps {
  readonly form: UseFormReturn<AccountSetupFormValues>;
}

function ServerReasons({ reasons }: { readonly reasons: readonly string[] }): JSX.Element | null {
  if (reasons.length === 0) return null;
  return (
    <ul className="list-inside list-disc text-xs text-destructive">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

/** Contraseña con su error, lo que la API rechazó (error-campos) y los requisitos en vivo. */
function NewPasswordField({
  form,
  reasons,
}: FieldProps & { readonly reasons: readonly string[] }): JSX.Element {
  const errors = form.formState.errors;
  const password = useWatch({ control: form.control, name: 'password' });
  return (
    <div className="space-y-1.5">
      <Label htmlFor="password">Contraseña</Label>
      <PasswordField
        id="password"
        autoComplete="new-password"
        error={errors.password !== undefined}
        aria-describedby={errors.password ? 'password-error' : undefined}
        {...form.register('password')}
      />
      <FieldError id="password-error" message={errors.password?.message} />
      <ServerReasons reasons={reasons} />
      <PasswordRequirements password={password} email="" />
    </div>
  );
}

function ConfirmPasswordField({ form }: FieldProps): JSX.Element {
  const errors = form.formState.errors;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="confirmPassword">Confirma la contraseña</Label>
      <PasswordField
        id="confirmPassword"
        autoComplete="new-password"
        error={errors.confirmPassword !== undefined}
        aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
        {...form.register('confirmPassword')}
      />
      <FieldError id="confirm-password-error" message={errors.confirmPassword?.message} />
    </div>
  );
}

function stateOf(submitting: boolean, reasons: readonly string[]): string {
  if (submitting) return 'enviando';
  return reasons.length > 0 ? 'error-campos' : 'default';
}

/**
 * Primera contraseña de una cuenta interna con requisitos en vivo y confirmación (011 CA-5). Sin aviso de sesiones: el
 * alta no las toca. 2.ª copia del flujo de restablecer (002); unificar al tercer uso, PD-100.
 */
export function AccountSetupForm(options: AccountSetupFormOptions): JSX.Element {
  const { form, serverError, submitting, alertRef, onSubmit } = useAccountSetupForm(options);
  const reasons = weakPasswordReasons(serverError);

  return (
    <IdentityCard
      data-state={stateOf(submitting, reasons)}
      titleId={SETUP_TITLE_ID}
      title="Crea tu contraseña"
      icon={KeyRound}
      tone="info"
      description={
        <p className="text-sm text-secondary-foreground">
          Con ella entrarás a Nimbo con tu correo.
        </p>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <NewPasswordField form={form} reasons={reasons} />
        <ConfirmPasswordField form={form} />
        {serverError !== null && reasons.length === 0 ? (
          <ServerErrorAlert ref={alertRef} title={SETUP_ERROR_TITLE} error={serverError} />
        ) : null}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Creando contraseña' : 'Crear contraseña'}
        </Button>
      </form>
    </IdentityCard>
  );
}
