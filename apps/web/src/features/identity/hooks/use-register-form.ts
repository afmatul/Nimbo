'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema, type RegisterRequest } from '@nimbo/contracts';
import { useEffect, useRef, useState, type BaseSyntheticEvent } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { register as registerAccount } from '../api';
import type { CatalogPlan } from '../components/plan-picker';

/** Pasos del formulario: los datos de la cuenta y, con catálogo, la elección del plan. */
export type RegisterPhase = 'account' | 'plan';

export interface RegisterResult {
  readonly fullName: string;
  readonly email: string;
  readonly planId: string | undefined;
}

export interface RegisterFormOptions {
  readonly apiPublicUrl: string;
  readonly plans: readonly CatalogPlan[];
  /** Sin catálogo no hay paso «Plan»: la cuenta empieza en Personal. */
  readonly skipPlan: boolean;
  readonly defaults: { readonly fullName: string; readonly email: string };
  readonly defaultPlanId: string | undefined;
  readonly onSuccess: (result: RegisterResult) => void;
  readonly onStepChange?: ((phase: RegisterPhase) => void) | undefined;
}

const FORM_FIELDS = ['fullName', 'email', 'password', 'acceptTerms'] as const;
type FormField = (typeof FORM_FIELDS)[number];

function isFormField(field: string): field is FormField {
  return (FORM_FIELDS as readonly string[]).includes(field);
}

/** Primer error de la API que corresponde a un campo del formulario; los demás van al resumen. */
export function formFieldOf(error: ApiClientError): { name: FormField; message: string } | null {
  const issue = error.fields[0];
  if (issue === undefined || !isFormField(issue.field)) return null;
  return { name: issue.field, message: issue.message };
}

/** `planSlug` solo para un plan de pago: Personal es el de toda cuenta nueva. */
function paidPlanSlugOf(plans: readonly CatalogPlan[], planId: string | undefined) {
  const plan = plans.find((candidate) => candidate.id === planId);
  return plan === undefined || plan.free ? {} : { planSlug: plan.slug };
}

function useRegisterFields(
  defaults: RegisterFormOptions['defaults'],
): UseFormReturn<RegisterRequest> {
  return useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { ...defaults, password: '', acceptTerms: false as unknown as true },
  });
}

/** Un error de la API: el de un campo vuelve al paso «Cuenta» con el foco en él; el general va al resumen. */
function useServerError(
  form: UseFormReturn<RegisterRequest>,
  goTo: (phase: RegisterPhase) => void,
) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [focusField, setFocusField] = useState<FormField | null>(null);
  const { setFocus, setError } = form;
  useEffect(() => {
    if (focusField !== null) setFocus(focusField);
    else if (serverError !== null) summaryRef.current?.focus();
  }, [focusField, serverError, setFocus]);
  const fail = (caught: unknown): void => {
    const error = toApiClientError(caught);
    const field = formFieldOf(error);
    setServerError(error);
    if (field !== null) {
      goTo('account');
      setError(field.name, { message: field.message });
    }
    setFocusField(field?.name ?? null);
  };
  return { summaryRef, serverError, fail, clear: () => setServerError(null) };
}

export interface RegisterFormState {
  readonly form: UseFormReturn<RegisterRequest>;
  readonly phase: RegisterPhase;
  readonly planId: string | undefined;
  readonly setPlanId: (planId: string) => void;
  readonly submitting: boolean;
  readonly errors: ReturnType<typeof useServerError>;
  /** «Continuar» o «Crear cuenta», según el paso. */
  readonly next: (event?: BaseSyntheticEvent) => Promise<void>;
  readonly back: () => void;
}

/**
 * Estado del registro en dos pasos (pedido de Adrián, 2026-11-13): «Continuar» valida la cuenta y lleva a «Plan»;
 * «Crear cuenta» envía el `POST` con el `planSlug` del plan de pago elegido.
 */
export function useRegisterForm(options: RegisterFormOptions): RegisterFormState {
  const form = useRegisterFields(options.defaults);
  const [phase, setPhase] = useState<RegisterPhase>('account');
  const [planId, setPlanId] = useState(options.defaultPlanId);
  const [submitting, setSubmitting] = useState(false);
  const goTo = (next: RegisterPhase): void => {
    setPhase(next);
    options.onStepChange?.(next);
  };
  const errors = useServerError(form, goTo);
  const send = async (values: RegisterRequest): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    errors.clear();
    try {
      await registerAccount(options.apiPublicUrl, {
        ...values,
        ...paidPlanSlugOf(options.plans, planId),
      });
      options.onSuccess({ fullName: values.fullName, email: values.email, planId });
    } catch (caught) {
      errors.fail(caught);
    } finally {
      setSubmitting(false);
    }
  };
  const toPlan = (): void => goTo('plan');
  const next = form.handleSubmit(options.skipPlan || phase === 'plan' ? send : toPlan);
  return { form, phase, planId, setPlanId, submitting, errors, next, back: () => goTo('account') };
}
