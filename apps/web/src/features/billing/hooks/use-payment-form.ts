'use client';

import { BILLING_ERROR_CODES, BILLING_FIELD_MESSAGES, type PaymentReceipt } from '@nimbo/contracts';
import { useState, type BaseSyntheticEvent } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import {
  EMPTY_PAYMENT_FORM,
  formFieldOf,
  type PaymentFieldIssue,
  type PaymentFormValues,
  type PaymentRequestResult,
} from '../payment-form-values';

/** Resultado del último envío (spec 009 §6) que no es un error de campo. */
export type PaymentOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'approved'; readonly payment: PaymentReceipt }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'failed'; readonly error: ApiClientError };

/** Qué se cobra: cómo se arma el cuerpo y a qué ruta va (contratar en la 009, renovar en la 010). */
export interface PaymentFormDeps<T> {
  readonly prepare: (values: PaymentFormValues) => PaymentRequestResult<T>;
  readonly pay: (request: T) => Promise<PaymentReceipt>;
}

export interface PaymentFormState {
  readonly form: UseFormReturn<PaymentFormValues>;
  readonly submitting: boolean;
  readonly outcome: PaymentOutcome;
  readonly submit: (event?: BaseSyntheticEvent) => Promise<void>;
}

const IDLE: PaymentOutcome = { kind: 'idle' };
const REJECTED: PaymentOutcome = { kind: 'rejected' };

function markFields(
  form: UseFormReturn<PaymentFormValues>,
  issues: readonly PaymentFieldIssue[],
): void {
  for (const { field, message } of issues) form.setError(field, { message });
  const [first] = issues;
  if (first !== undefined) form.setFocus(first.field);
}

/** `422` de la API (CA-5): sus motivos de campo, con el mensaje del catálogo (la web no muestra el del servidor). */
function apiFieldIssues(error: ApiClientError): PaymentFieldIssue[] {
  const fallback = messageForCode(BILLING_ERROR_CODES.BILLING_INVALID_INPUT);
  return error.fields.flatMap(({ field, reason }) => {
    const formField = formFieldOf(field);
    const message =
      (BILLING_FIELD_MESSAGES as Readonly<Record<string, string>>)[reason] ?? fallback;
    return formField === undefined ? [] : [{ field: formField, message }];
  });
}

/**
 * Rechazo (CA-4) → «rechazado»; errores de campo (`422`) → se marcan en el formulario y no hay resultado (`null`);
 * cualquier otro → «error» con el código para soporte.
 */
function failureOutcome(
  form: UseFormReturn<PaymentFormValues>,
  caught: unknown,
): PaymentOutcome | null {
  const error = toApiClientError(caught);
  if (error.code === BILLING_ERROR_CODES.BILLING_PAYMENT_REJECTED) return REJECTED;
  const issues = apiFieldIssues(error);
  if (issues.length === 0) return { kind: 'failed', error };
  markFields(form, issues);
  return null;
}

/** Valida y cobra: el resultado a mostrar, o `null` si los errores quedaron marcados en sus campos. */
async function paymentOutcome<T>(
  deps: PaymentFormDeps<T>,
  form: UseFormReturn<PaymentFormValues>,
  values: PaymentFormValues,
): Promise<PaymentOutcome | null> {
  const parsed = deps.prepare(values);
  if (!parsed.ok) {
    markFields(form, parsed.issues);
    return null;
  }
  try {
    const payment = await deps.pay(parsed.request);
    return { kind: 'approved', payment };
  } catch (caught) {
    return failureOutcome(form, caught);
  }
}

/**
 * Estado y envío del pago simulado (spec 009 CA-3 a CA-5, §6; 010 CA-8 a CA-10): valida RN-9 antes de llamar y traduce
 * cada respuesta; un `409` de la renovación (CA-26, CA-28) llega como «error» con su mensaje del catálogo.
 */
export function usePaymentForm<T>(deps: PaymentFormDeps<T>): PaymentFormState {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<PaymentOutcome>(IDLE);
  const form = useForm<PaymentFormValues>({ defaultValues: EMPTY_PAYMENT_FORM });

  const submit = form.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setOutcome(IDLE);
    try {
      const result = await paymentOutcome(deps, form, values);
      if (result !== null) setOutcome(result);
    } finally {
      setSubmitting(false);
    }
  });

  return { form, submitting, outcome, submit };
}
