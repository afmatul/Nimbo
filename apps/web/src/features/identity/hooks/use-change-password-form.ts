'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IDENTITY_ERROR_CODES, evaluatePassword } from '@nimbo/contracts';
import { useState, type BaseSyntheticEvent } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode, messageForReason } from '../../../lib/error-catalog';
import { changePassword } from '../api';
import type { AuthFetch } from '../session/auth-fetch';

export const PASSWORD_MISMATCH_MESSAGE =
  'Las contraseñas no coinciden. Escribe la misma en los dos campos.';
/** Texto de «Seguridad» para la contraseña nueva débil (spec 002 §11). */
export const WEAK_NEW_PASSWORD_MESSAGE = 'La contraseña no cumple todos los requisitos.';

/** Sin el correo, «igual al correo» la completa la API (CA-22). */
function meetsPasswordPolicy(password: string): boolean {
  return evaluatePassword(password, '').every((result) => result.passed);
}

/** La confirmación solo existe en el cliente (D-7): si no coincide, no se envía. */
const changePasswordFormSchema = z
  .object({ currentPassword: z.string(), newPassword: z.string(), confirmPassword: z.string() })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (!meetsPasswordPolicy(newPassword)) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: WEAK_NEW_PASSWORD_MESSAGE });
    }
    if (confirmPassword !== newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: PASSWORD_MISMATCH_MESSAGE,
      });
    }
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/** Resultado del último envío que no es un error de campo. */
export type ChangePasswordOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'failed'; readonly error: ApiClientError };

const IDLE: ChangePasswordOutcome = { kind: 'idle' };
const CHANGED: ChangePasswordOutcome = { kind: 'changed' };

export interface ChangePasswordFormDeps {
  readonly apiPublicUrl: string;
  readonly authFetch: AuthFetch;
  readonly onChanged?: () => void;
}

export interface ChangePasswordFormState {
  readonly form: UseFormReturn<ChangePasswordFormValues>;
  readonly submitting: boolean;
  readonly outcome: ChangePasswordOutcome;
  /** Requisitos que la API marcó como incumplidos en `IDENTITY_WEAK_PASSWORD` (contrasena-debil). */
  readonly weakReasons: readonly string[];
  readonly submit: (event?: BaseSyntheticEvent) => Promise<void>;
}

function weakReasonsOf(error: ApiClientError): string[] {
  return error.fields.map((issue) => messageForReason(issue.reason, error.correlationId));
}

/**
 * Errores de campo de la API (CA-22, CA-23). Tras `IDENTITY_WRONG_PASSWORD` la actual se vacía y recibe el foco; la
 * nueva y la confirmación se conservan. Devuelve `false` si el error no es de un campo.
 */
function showFieldError(
  form: UseFormReturn<ChangePasswordFormValues>,
  error: ApiClientError,
): boolean {
  if (error.code === IDENTITY_ERROR_CODES.WRONG_PASSWORD) {
    form.setValue('currentPassword', '');
    form.setError('currentPassword', { message: messageForCode(error.code) });
    form.setFocus('currentPassword');
    return true;
  }
  if (error.code === IDENTITY_ERROR_CODES.WEAK_PASSWORD) {
    form.setError('newPassword', { message: WEAK_NEW_PASSWORD_MESSAGE });
    form.setFocus('newPassword');
    return true;
  }
  return false;
}

/** Estado y envío de «Cambiar contraseña» (spec 002 §11, CA-22, CA-23). */
export function useChangePasswordForm(deps: ChangePasswordFormDeps): ChangePasswordFormState {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ChangePasswordOutcome>(IDLE);
  const [weakReasons, setWeakReasons] = useState<readonly string[]>([]);
  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function send({ currentPassword, newPassword }: ChangePasswordFormValues): Promise<void> {
    try {
      await changePassword(deps.apiPublicUrl, deps.authFetch, { currentPassword, newPassword });
      form.reset();
      setOutcome(CHANGED);
      deps.onChanged?.();
    } catch (caught) {
      const error = toApiClientError(caught);
      if (error.code === IDENTITY_ERROR_CODES.WEAK_PASSWORD) setWeakReasons(weakReasonsOf(error));
      if (!showFieldError(form, error)) setOutcome({ kind: 'failed', error });
    }
  }

  const submit = form.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setOutcome(IDLE);
    setWeakReasons([]);
    await send(values);
    setSubmitting(false);
  });

  return { form, submitting, outcome, weakReasons, submit };
}
