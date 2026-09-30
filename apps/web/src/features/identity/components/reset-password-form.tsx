'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IDENTITY_ERROR_CODES, evaluatePassword } from '@nimbo/contracts';
import { KeyRound } from 'lucide-react';
import { useState, type JSX } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode, messageForReason } from '../../../lib/error-catalog';
import { resetPassword } from '../api';
import { resetLinkProblemOf } from '../hooks/use-reset-link';
import { forgetSession } from '../session/session-memory';

import { FieldError } from './field-error';
import type { LinkProblem } from './link-problem-card';
import { PasswordField } from './password-field';
import { PasswordRequirements } from './password-requirements';
import { ServerErrorAlert } from './server-error-alert';

const PASSWORD_MISMATCH_MESSAGE =
  'Las contraseñas no coinciden. Escribe la misma en los dos campos.';
const RESET_ERROR_TITLE = 'No pudimos cambiar tu contraseña.';

/** Sin el correo, «igual al correo» la completa la API (CA-21). */
function meetsPasswordPolicy(password: string): boolean {
  return evaluatePassword(password, '').every((result) => result.passed);
}

/** La confirmación solo existe en el cliente (D-7): si no coincide, no se envía. */
const resetPasswordFormSchema = z
  .object({ password: z.string(), confirmPassword: z.string() })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (!meetsPasswordPolicy(password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: messageForCode(IDENTITY_ERROR_CODES.WEAK_PASSWORD),
      });
    }
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: PASSWORD_MISMATCH_MESSAGE,
      });
    }
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

/** Requisitos que la API marcó como incumplidos en `IDENTITY_WEAK_PASSWORD` (estado error-campos). */
function weakPasswordReasons(error: ApiClientError | null): string[] {
  if (error?.code !== IDENTITY_ERROR_CODES.WEAK_PASSWORD) return [];
  return error.fields
    .filter((issue) => issue.field === 'password')
    .map((issue) => messageForReason(issue.reason, error.correlationId));
}

export interface ResetPasswordFormProps {
  readonly apiPublicUrl: string;
  readonly token: string;
  readonly onDone: () => void;
  readonly onLinkRejected: (problem: LinkProblem) => void;
}

/** Contraseña nueva con requisitos en vivo y confirmación (spec 002 §11, CA-19, CA-21). */
export function ResetPasswordForm({
  apiPublicUrl,
  token,
  onDone,
  onLinkRejected,
}: ResetPasswordFormProps): JSX.Element {
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });
  const serverReasons = weakPasswordReasons(serverError);

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await resetPassword(apiPublicUrl, { token, password: values.password });
      forgetSession();
      onDone();
    } catch (caught) {
      const problem = resetLinkProblemOf(caught);
      if (problem !== null) {
        onLinkRejected(problem);
        return;
      }
      const error = toApiClientError(caught);
      setServerError(error);
      if (error.code === IDENTITY_ERROR_CODES.WEAK_PASSWORD) {
        setError('password', { message: messageForCode(error.code) });
        setFocus('password');
      }
    } finally {
      setSubmitting(false);
    }
  });

  const showServerAlert = serverError !== null && serverReasons.length === 0;

  return (
    <IdentityCard
      data-state={serverReasons.length > 0 ? 'error-campos' : 'default'}
      titleId="nueva-contrasena"
      title="Elige una contraseña nueva"
      icon={KeyRound}
      tone="info"
      description={
        <p className="text-sm text-secondary-foreground">
          Al cambiarla cerraremos todas tus sesiones.
        </p>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña nueva</Label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            error={errors.password !== undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <FieldError id="password-error" message={errors.password?.message} />
          {serverReasons.length === 0 ? null : (
            <ul className="list-inside list-disc text-xs text-destructive">
              {serverReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <PasswordRequirements password={password} email="" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirma la contraseña nueva</Label>
          <PasswordField
            id="confirmPassword"
            autoComplete="new-password"
            error={errors.confirmPassword !== undefined}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
            {...register('confirmPassword')}
          />
          <FieldError id="confirm-password-error" message={errors.confirmPassword?.message} />
        </div>
        {showServerAlert ? (
          <ServerErrorAlert title={RESET_ERROR_TITLE} error={serverError} />
        ) : null}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Cambiando contraseña' : 'Cambiar contraseña'}
        </Button>
      </form>
    </IdentityCard>
  );
}
