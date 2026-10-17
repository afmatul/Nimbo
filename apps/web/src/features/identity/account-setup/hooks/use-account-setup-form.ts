'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IDENTITY_ERROR_CODES, evaluatePassword, type AccountSetupRequest } from '@nimbo/contracts';
import { useEffect, useRef, useState, type BaseSyntheticEvent, type RefObject } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { toApiClientError, type ApiClientError } from '../../../../lib/api-error';
import { messageForCode, messageForReason } from '../../../../lib/error-catalog';
import { setFirstPassword } from '../api';

import { setupLinkProblemOf, type SetupLinkProblem } from './use-account-setup-link';

const PASSWORD_MISMATCH_MESSAGE =
  'Las contraseñas no coinciden. Escribe la misma en los dos campos.';

/** Sin el correo, «igual al correo» la completa la API. La confirmación solo existe en el cliente. */
const accountSetupFormSchema = z
  .object({ password: z.string(), confirmPassword: z.string() })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (!evaluatePassword(password, '').every((result) => result.passed)) {
      const message = messageForCode(IDENTITY_ERROR_CODES.WEAK_PASSWORD);
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message });
    }
    if (confirmPassword !== password) {
      const message = PASSWORD_MISMATCH_MESSAGE;
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message });
    }
  });

export type AccountSetupFormValues = z.infer<typeof accountSetupFormSchema>;

type SubmitOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'link'; readonly problem: SetupLinkProblem }
  | { readonly kind: 'error'; readonly error: ApiClientError };

async function submitFirstPassword(
  apiPublicUrl: string,
  input: AccountSetupRequest,
): Promise<SubmitOutcome> {
  try {
    await setFirstPassword(apiPublicUrl, input);
    return { kind: 'done' };
  } catch (caught) {
    const problem = setupLinkProblemOf(caught);
    if (problem !== null) return { kind: 'link', problem };
    return { kind: 'error', error: toApiClientError(caught) };
  }
}

/** Requisitos que la API marcó como incumplidos en `IDENTITY_WEAK_PASSWORD` (estado error-campos). */
export function weakPasswordReasons(error: ApiClientError | null): string[] {
  if (error?.code !== IDENTITY_ERROR_CODES.WEAK_PASSWORD) return [];
  return error.fields
    .filter((issue) => issue.field === 'password')
    .map((issue) => messageForReason(issue.reason, error.correlationId));
}

/** Foco en la alerta de un error del servidor que no es de campos. */
function useServerAlertFocus(error: ApiClientError | null): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error !== null && error.code !== IDENTITY_ERROR_CODES.WEAK_PASSWORD) ref.current?.focus();
  }, [error]);
  return ref;
}

export interface AccountSetupFormOptions {
  readonly apiPublicUrl: string;
  readonly token: string;
  readonly onDone: () => void;
  readonly onLinkRejected: (problem: SetupLinkProblem) => void;
}

export interface AccountSetupFormState {
  readonly form: UseFormReturn<AccountSetupFormValues>;
  readonly serverError: ApiClientError | null;
  readonly submitting: boolean;
  readonly alertRef: RefObject<HTMLDivElement | null>;
  readonly onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
}

/** Estado y envío del formulario: el foco va a la contraseña al abrirlo y ante un rechazo de la política. */
export function useAccountSetupForm(options: AccountSetupFormOptions): AccountSetupFormState {
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const alertRef = useServerAlertFocus(serverError);
  const form = useForm<AccountSetupFormValues>({
    resolver: zodResolver(accountSetupFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const { setFocus, setError } = form;
  useEffect(() => setFocus('password'), [setFocus]);

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setSubmitting(true);
    setServerError(null);
    const outcome = await submitFirstPassword(options.apiPublicUrl, {
      token: options.token,
      password,
    });
    setSubmitting(false);
    if (outcome.kind === 'done') return options.onDone();
    if (outcome.kind === 'link') return options.onLinkRejected(outcome.problem);
    setServerError(outcome.error);
    if (outcome.error.code !== IDENTITY_ERROR_CODES.WEAK_PASSWORD) return;
    setError('password', { message: messageForCode(outcome.error.code) });
    setFocus('password');
  });

  return { form, serverError, submitting, alertRef, onSubmit };
}
