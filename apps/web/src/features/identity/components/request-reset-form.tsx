'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  IDENTITY_ERROR_CODES,
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
} from '@nimbo/contracts';
import { KeyRound } from 'lucide-react';
import { useState, type JSX } from 'react';
import { useForm } from 'react-hook-form';

import { IdentityCard } from '../../../components/nimbo/identity-card';
import { TextLink } from '../../../components/nimbo/text-link';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { forgotPassword } from '../api';
import { LOGIN_PATH } from '../routes';

import { CheckEmailPanel } from './check-email-panel';
import { FieldError } from './field-error';
import { LimitAlert } from './limit-alert';
import { SEND_LINK_ERROR_TITLE, ServerErrorAlert } from './server-error-alert';

/** Rechazo del último envío: el límite de CA-18 o cualquier otro error. */
function RejectionNotice({ error }: { readonly error: ApiClientError }): JSX.Element {
  if (error.code !== IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS) {
    return <ServerErrorAlert title={SEND_LINK_ERROR_TITLE} error={error} />;
  }
  const message = messageForCode(error.code, {
    correlationId: error.correlationId,
    retryAfterSeconds: error.retryAfterSeconds,
  });
  return (
    <div data-state="limite">
      <LimitAlert message={message} />
    </div>
  );
}

/**
 * Pide el enlace de recuperación (spec 002 §11, esquema de `registro--pedir-enlace`). La respuesta es la misma para
 * cualquier correo (CA-18): «Revisa tu correo» sin «Cambiar correo».
 */
export function RequestResetForm({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  if (sentEmail !== null) return <CheckEmailPanel variant="password-reset" email={sentEmail} />;

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(apiPublicUrl, values);
      setSentEmail(values.email);
    } catch (caught) {
      setError(toApiClientError(caught));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <IdentityCard
      titleId="restablecer-contrasena"
      title="Restablecer contraseña"
      icon={KeyRound}
      tone="info"
      description={
        <p className="text-sm text-secondary-foreground">
          Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
        </p>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            error={errors.email !== undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>
        {error === null ? null : <RejectionNotice error={error} />}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Enviando enlace' : 'Enviar enlace'}
        </Button>
      </form>
      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        ¿Recordaste tu contraseña? <TextLink href={LOGIN_PATH}>Iniciar sesión</TextLink>
      </p>
    </IdentityCard>
  );
}
