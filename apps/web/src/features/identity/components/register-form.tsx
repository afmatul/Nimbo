'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, type RegisterRequest } from '@nimbo/contracts';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useForm, useWatch, type SubmitHandler } from 'react-hook-form';

import { TextLink } from '../../../components/nimbo/text-link';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { register as registerAccount } from '../api';

import { PasswordRequirements } from './password-requirements';
import { PlanPicker, type CatalogPlan } from './plan-picker';
import { ServerErrorAlert } from './server-error-alert';

export interface RegisterFormProps {
  readonly apiPublicUrl: string;
  readonly plans: readonly CatalogPlan[];
  readonly unavailable?: boolean;
  readonly defaultFullName?: string;
  readonly defaultEmail?: string;
  readonly defaultPlanId?: string | undefined;
  readonly onSuccess: (result: {
    readonly fullName: string;
    readonly email: string;
    readonly planId: string | undefined;
  }) => void;
}

const SERVER_ERROR_TITLE = 'No pudimos crear tu cuenta.';

const FORM_FIELDS = ['fullName', 'email', 'password', 'acceptTerms'] as const;
type FormField = (typeof FORM_FIELDS)[number];

function isFormField(field: string): field is FormField {
  return (FORM_FIELDS as readonly string[]).includes(field);
}

/** Primer error de la API que corresponde a un campo del formulario; los demás van al resumen. */
function formFieldOf(error: ApiClientError): { name: FormField; message: string } | null {
  const issue = error.fields[0];
  if (issue === undefined || !isFormField(issue.field)) return null;
  return { name: issue.field, message: issue.message };
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
    control,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: {
      fullName: defaultFullName,
      email: defaultEmail,
      password: '',
      acceptTerms: false as unknown as true,
    },
  });

  useEffect(() => {
    if (serverError !== null && formFieldOf(serverError) === null) summaryRef.current?.focus();
  }, [serverError]);

  const submit: SubmitHandler<RegisterRequest> = async (values) => {
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
      const error = toApiClientError(caught);
      setServerError(error);
      const field = formFieldOf(error);
      if (field !== null) {
        setError(field.name, { message: field.message });
        setFocus(field.name);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const password = useWatch({ control, name: 'password' }) ?? '';
  const email = useWatch({ control, name: 'email' }) ?? '';

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
      {serverError ? (
        <ServerErrorAlert ref={summaryRef} title={SERVER_ERROR_TITLE} error={serverError} />
      ) : null}
      <PlanPicker plans={plans} unavailable={unavailable} value={planId} onChange={setPlanId} />
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input
          id="fullName"
          autoComplete="name"
          error={errors.fullName !== undefined}
          {...register('fullName')}
        />
        {errors.fullName ? (
          <p className="text-xs text-destructive">{errors.fullName.message}</p>
        ) : null}
      </div>
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
            Acepto los <TextLink href="/terminos">Términos</TextLink> y la{' '}
            <TextLink href="/privacidad">Política de privacidad</TextLink>.
          </>
        }
        error={errors.acceptTerms !== undefined}
        errorMessage={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />
      <Button type="submit" loading={submitting}>
        {submitting ? 'Creando tu cuenta' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
