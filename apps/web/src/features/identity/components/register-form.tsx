'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, type RegisterRequest } from '@nimbo/contracts';
import { useRef, useState, type JSX } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { register as registerAccount } from '../api';
import { PasswordRequirements } from './password-requirements';
import { PlanPicker, type CatalogPlan } from './plan-picker';

export interface RegisterFormProps {
  readonly apiPublicUrl: string;
  readonly plans: readonly CatalogPlan[];
  readonly unavailable?: boolean;
  readonly defaultFullName?: string;
  readonly defaultEmail?: string;
  readonly defaultPlanId?: string;
  readonly onSuccess: (result: {
    readonly fullName: string;
    readonly email: string;
    readonly planId: string | undefined;
  }) => void;
}

/** El plan elegido es estado local: no viaja en el `POST` (D-24, CA-7). */
export function RegisterForm({
  apiPublicUrl,
  plans,
  unavailable = false,
  defaultFullName = '',
  defaultEmail = '',
  defaultPlanId,
  onSuccess,
}: RegisterFormProps): JSX.Element {
  const summaryRef = useRef<HTMLDivElement>(null);
  const [planId, setPlanId] = useState(defaultPlanId);
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { fullName: defaultFullName, email: defaultEmail, password: '', acceptTerms: false as unknown as true },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await registerAccount(apiPublicUrl, {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        acceptTerms: true,
      });
      onSuccess({ fullName: values.fullName, email: values.email, planId });
    } catch (caught) {
      const error = caught instanceof ApiClientError ? caught : null;
      setServerError(
        error ??
          new ApiClientError({
            code: 'INTERNAL_ERROR',
            message: 'Ocurrió un error inesperado. Intenta de nuevo.',
            correlationId: '',
          }),
      );
      const firstField = error?.fields[0]?.field;
      if (firstField === 'fullName' || firstField === 'email' || firstField === 'password' || firstField === 'acceptTerms') {
        setError(firstField, { message: error?.fields[0]?.message });
        setFocus(firstField);
      } else {
        summaryRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  });

  const password = watch('password') ?? '';
  const email = watch('email') ?? '';

  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)} noValidate>
      <PlanPicker plans={plans} unavailable={unavailable} value={planId} onChange={setPlanId} />
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input id="fullName" autoComplete="name" error={errors.fullName !== undefined} {...register('fullName')} />
        {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" type="email" autoComplete="email" error={errors.email !== undefined} {...register('email')} />
        {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password !== undefined}
          {...register('password')}
        />
        <PasswordRequirements password={password} email={email} />
      </div>
      <Checkbox
        label={
          <>
            Acepto los <a href="/terminos">Términos</a> y la <a href="/privacidad">Política de privacidad</a>.
          </>
        }
        error={errors.acceptTerms !== undefined}
        errorMessage={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />
      {serverError ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="text-sm text-destructive">
          <p>{messageForCode(serverError.code, { correlationId: serverError.correlationId, retryAfterSeconds: serverError.retryAfterSeconds })}</p>
          {serverError.correlationId !== '' ? <p>Código: {serverError.correlationId}</p> : null}
        </div>
      ) : null}
      <Button type="submit" loading={submitting}>
        {submitting ? 'Creando tu cuenta' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
