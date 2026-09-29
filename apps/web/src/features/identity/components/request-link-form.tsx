'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  IDENTITY_ERROR_CODES,
  resendVerificationRequestSchema,
  type ResendVerificationRequest,
} from '@nimbo/contracts';
import { useEffect, useState, type JSX } from 'react';
import { useForm } from 'react-hook-form';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { resendVerification } from '../api';
import { useCountdown } from '../hooks/use-countdown';

import { CheckEmailPanel } from './check-email-panel';
import { ResendLinkButton } from './resend-link-button';
import { ServerErrorAlert } from './server-error-alert';

/** 002 prellena el correo aquí. No se lee de la URL: no debe quedar en bitácoras de Next ni de Traefik. */
export const REQUEST_LINK_EMAIL_KEY = 'nimbo.registro.correo';

export function readRequestLinkEmail(storage: Storage | undefined): string {
  return storage?.getItem(REQUEST_LINK_EMAIL_KEY) ?? '';
}

function LimitNotice({
  message,
  seconds,
}: {
  readonly message: string;
  readonly seconds: number;
}): JSX.Element {
  const remaining = useCountdown(seconds);
  return (
    <div data-state="limite-reenvio" className="space-y-2">
      <Alert>{message}</Alert>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {remaining > 0
          ? `Podrás pedirlo de nuevo en ${String(remaining)} segundos.`
          : 'Ya puedes pedir otro enlace.'}
      </p>
    </div>
  );
}

/** Pide un enlace nuevo. La respuesta de éxito es la misma para cualquier correo (CA-14). */
export function RequestLinkForm({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [limit, setLimit] = useState<{
    readonly id: number;
    readonly message: string;
    readonly seconds: number;
  } | null>(null);
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ResendVerificationRequest>({
    resolver: zodResolver(resendVerificationRequestSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    const stored = readRequestLinkEmail(window.sessionStorage);
    if (stored !== '') setValue('email', stored);
  }, [setValue]);

  if (sentEmail !== null) {
    return (
      <CheckEmailPanel email={sentEmail} onChangeEmail={() => setSentEmail(null)}>
        <ResendLinkButton apiPublicUrl={apiPublicUrl} email={sentEmail} />
      </CheckEmailPanel>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await resendVerification(apiPublicUrl, { email: values.email });
      setSentEmail(values.email);
    } catch (caught) {
      const error = toApiClientError(caught);
      if (error.code !== IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS) {
        setServerError(error);
        return;
      }
      const seconds = error.retryAfterSeconds ?? EMAIL_REQUEST_COOLDOWN_SECONDS;
      setLimit({
        id: (limit?.id ?? 0) + 1,
        message: messageForCode(error.code, {
          correlationId: error.correlationId,
          retryAfterSeconds: seconds,
        }),
        seconds,
      });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <section
      aria-labelledby="pedir-enlace"
      className="mx-auto w-full max-w-lg space-y-4 px-4 py-10"
    >
      <h1 id="pedir-enlace" className="text-2xl font-semibold text-foreground">
        Pedir un enlace nuevo
      </h1>
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            error={errors.email !== undefined}
            {...register('email')}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        {limit !== null ? (
          <LimitNotice key={limit.id} message={limit.message} seconds={limit.seconds} />
        ) : null}
        {serverError !== null ? <ServerErrorAlert error={serverError} /> : null}
        <Button type="submit" loading={submitting}>
          Pedir enlace
        </Button>
      </form>
    </section>
  );
}
