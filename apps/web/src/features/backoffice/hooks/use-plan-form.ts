'use client';

import type { CreatePlanRequest, PlanAdminView } from '@nimbo/contracts';
import * as React from 'react';
import { useForm, type FieldErrors as FormErrors, type UseFormReturn } from 'react-hook-form';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import {
  bytesOf,
  centsOf,
  integerOf,
  PLAN_FORM_DEFAULTS,
  toPlanRequest,
  type PlanFormValues,
} from '../plan-form-values';

import { isForbidden } from './use-latest-request';

export type CreatePlanCall = (request: CreatePlanRequest) => Promise<PlanAdminView>;

/** Los campos del formulario y su id (el resumen de errores enlaza a ellos). */
export const PLAN_FIELDS = [
  'name',
  'description',
  'price',
  'quota',
  'maxFile',
  'maxEditors',
  'agentQueries',
  'retainedVersions',
  'trashRetentionDays',
] as const;

export type PlanField = (typeof PLAN_FIELDS)[number];

/** El mensaje de cada campo con error. */
export type PlanFieldErrors = Partial<Readonly<Record<PlanField, string>>>;

/** `fields`: lo que el servidor rechaza (422); `server`: lo demás (red, 500). */
export type PlanProblem =
  { readonly kind: 'fields' } | { readonly kind: 'server'; readonly error: ApiClientError };

export type PlanFormPhase =
  | { readonly status: 'editing'; readonly problem: PlanProblem | null }
  | { readonly status: 'submitting' }
  | { readonly status: 'created'; readonly plan: PlanAdminView }
  | { readonly status: 'forbidden' };

export interface PlanForm {
  readonly form: UseFormReturn<PlanFormValues, unknown, PlanFormValues>;
  readonly errors: PlanFieldErrors;
  readonly phase: PlanFormPhase;
  readonly submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}

/** Los mensajes propios de la forma (el servidor manda en las reglas del plan, CA-11). */
const SHAPE_MESSAGES: Readonly<Record<PlanField, string>> = {
  name: 'Escribe el nombre del plan.',
  description: 'Escribe una descripción.',
  price: 'Escribe el precio al mes con centavos, por ejemplo 125.00.',
  quota: 'Escribe el almacenamiento del plan.',
  maxFile: 'Escribe el máximo por archivo.',
  maxEditors: 'Escribe cuántos editores simultáneos admite.',
  agentQueries: 'Escribe cuántas consultas al mes admite.',
  retainedVersions: 'Escribe cuántas versiones retiene.',
  trashRetentionDays: 'Escribe cuántos días guarda la papelera.',
};

/** Lo que no se puede traducir a un número: el campo y su mensaje, uno por campo. */
function shapeProblem(values: PlanFormValues): PlanFieldErrors {
  const errors: Record<string, string> = {};
  if (values.name.trim() === '') errors.name = SHAPE_MESSAGES.name;
  if (values.description.trim() === '') errors.description = SHAPE_MESSAGES.description;
  if (centsOf(values.price) === null) errors.price = SHAPE_MESSAGES.price;
  if (bytesOf(values.quota, values.quotaUnit) === null) errors.quota = SHAPE_MESSAGES.quota;
  if (bytesOf(values.maxFile, values.maxFileUnit) === null) errors.maxFile = SHAPE_MESSAGES.maxFile;
  if (integerOf(values.maxEditors) === null) errors.maxEditors = SHAPE_MESSAGES.maxEditors;
  if (integerOf(values.agentQueries) === null) errors.agentQueries = SHAPE_MESSAGES.agentQueries;
  if (integerOf(values.retainedVersions) === null) {
    errors.retainedVersions = SHAPE_MESSAGES.retainedVersions;
  }
  if (integerOf(values.trashRetentionDays) === null) {
    errors.trashRetentionDays = SHAPE_MESSAGES.trashRetentionDays;
  }
  return errors;
}

/** Los mensajes de cada campo, a partir de los del formulario. */
function messagesOf(errors: FormErrors<PlanFormValues>): PlanFieldErrors {
  const messages: Record<string, string> = {};
  for (const field of PLAN_FIELDS) {
    const message = errors[field]?.message;
    if (message !== undefined) messages[field] = message;
  }
  return messages;
}

/** El campo del formulario que corresponde al del contrato: la API manda los del contrato (011 CA-11). */
const FIELD_BY_CONTRACT: Readonly<Record<string, PlanField>> = {
  name: 'name',
  description: 'description',
  priceCents: 'price',
  quotaBytes: 'quota',
  maxFileBytes: 'maxFile',
  maxEditors: 'maxEditors',
  agentQueriesPerMonth: 'agentQueries',
  retainedVersions: 'retainedVersions',
  trashRetentionDays: 'trashRetentionDays',
};

/** `fields` del `422`: el campo y el mensaje que manda el servidor (011 CA-11). */
function serverFieldErrors(error: ApiClientError): PlanFieldErrors {
  const messages: Record<string, string> = {};
  for (const issue of error.fields ?? []) {
    const field = FIELD_BY_CONTRACT[issue.field];
    if (field === undefined) continue;
    messages[field] = issue.message;
  }
  return messages;
}

/**
 * Lo que contesta el servidor al alta: `403` (el que ya no puede), los campos que rechaza (422) o el error sin
 * campos (red, 500). En los dos últimos casos se marca cada campo con su mensaje.
 */
function rejectedPhase(
  caught: unknown,
  form: UseFormReturn<PlanFormValues, unknown, PlanFormValues>,
): PlanFormPhase {
  const error = toApiClientError(caught);
  if (isForbidden(error)) return { status: 'forbidden' };
  const issues = serverFieldErrors(error);
  if (Object.keys(issues).length === 0) {
    return { status: 'editing', problem: { kind: 'server', error } };
  }
  for (const [field, message] of Object.entries(issues)) {
    form.setError(field as PlanField, { type: 'server', message });
  }
  return { status: 'editing', problem: { kind: 'fields' } };
}

/**
 * El alta de un plan (011 CA-9, CA-11): el formulario valida la forma (que los campos estén escritos) y la API valida
 * las reglas del plan; su `422` con los campos se muestra tal cual, sin perder lo escrito.
 */
export function usePlanForm(create: CreatePlanCall): PlanForm {
  const [phase, setPhase] = React.useState<PlanFormPhase>({ status: 'editing', problem: null });
  const form = useForm<PlanFormValues, unknown, PlanFormValues>({
    defaultValues: PLAN_FORM_DEFAULTS,
    shouldFocusError: false,
  });
  const send = async (values: PlanFormValues): Promise<void> => {
    const shape = shapeProblem(values);
    if (Object.keys(shape).length > 0) {
      for (const [field, message] of Object.entries(shape)) {
        form.setError(field as PlanField, { type: 'shape', message });
      }
      setPhase({ status: 'editing', problem: { kind: 'fields' } });
      return;
    }
    const request = toPlanRequest(values);
    if (request === null) return;
    setPhase({ status: 'submitting' });
    try {
      const plan = await create(request);
      setPhase({ status: 'created', plan });
    } catch (caught: unknown) {
      setPhase(rejectedPhase(caught, form));
    }
  };
  const submit = form.handleSubmit((values) => void send(values));
  return { form, errors: messagesOf(form.formState.errors), phase, submit };
}
