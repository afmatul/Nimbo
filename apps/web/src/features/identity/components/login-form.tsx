'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@nimbo/contracts';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';
import { useForm } from 'react-hook-form';

import { TextLink } from '../../../components/nimbo/text-link';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { homePathFor } from '../../access/home-path';
import { login } from '../api';
import { rememberSession } from '../session/session-memory';

import { LoginAlert, RESET_PASSWORD_HREF } from './login-alert';
import { PasswordField } from './password-field';

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

/**
 * Inicio de sesión (spec 002 §11, mockup p. 07). Con éxito deja la sesión en memoria (CA-28) y lleva al inicio del rol
 * (CA-1); los rechazos se muestran en una alerta encima del botón.
 */
export function LoginForm({ apiPublicUrl }: { readonly apiPublicUrl: string }): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await login(apiPublicUrl, values);
      rememberSession(session);
      router.replace(homePathFor(session.user.role));
    } catch (caught) {
      setError(toApiClientError(caught));
      setSubmitting(false);
    }
  });

  return (
    <section aria-labelledby="inicia-sesion" className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 id="inicia-sesion" className="text-2xl font-semibold text-foreground">
          Inicia sesión
        </h1>
        <p className="text-sm text-secondary-foreground">Entra con el correo de tu cuenta Nimbo.</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
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
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <TextLink href={RESET_PASSWORD_HREF} className="text-xs">
              ¿Olvidaste tu contraseña?
            </TextLink>
          </div>
          <PasswordField
            id="password"
            autoComplete="current-password"
            error={errors.password !== undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <FieldError id="password-error" message={errors.password?.message} />
        </div>
        {error === null ? null : <LoginAlert error={error} />}
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Iniciando sesión' : 'Iniciar sesión'}
        </Button>
      </form>
    </section>
  );
}
