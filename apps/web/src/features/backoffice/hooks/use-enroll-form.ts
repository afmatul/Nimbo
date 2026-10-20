'use client';

import {
  IDENTITY_ERROR_CODES,
  REQUIRED_REASON,
  enrollInternalAccountRequestSchema,
  type AccountListItem,
  type EnrollInternalAccountRequest,
  type FieldIssueResponse,
  type InternalRoleName,
} from '@nimbo/contracts';
import * as React from 'react';
import {
  useForm,
  type FieldErrors as FormErrors,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';
import { z } from 'zod';

import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { enrollmentFieldMessage } from '../../../lib/error-catalog';

import { isForbidden } from './use-latest-request';

/** `POST /backoffice/accounts`. */
export type EnrollAccountCall = (request: EnrollInternalAccountRequest) => Promise<AccountListItem>;

export const ENROLL_FIELDS = ['fullName', 'email', 'employeeCode', 'role'] as const;
export type EnrollField = (typeof ENROLL_FIELDS)[number];

/** Lo escrito; el rol empieza sin elegir (mockup, decisión 3). */
export type EnrollFormValues = Omit<EnrollInternalAccountRequest, 'role'> & {
  role?: InternalRoleName | null | undefined;
};

/** El mensaje de cada campo con error, en el orden del formulario. */
export type FieldErrors = Partial<Readonly<Record<EnrollField, string>>>;

/** `fields`: validación (navegador o `422`); `conflict`: `409` con el correo o el código en uso; `server`: lo demás. */
export type EnrollProblem =
  | { readonly kind: 'fields' | 'conflict' }
  | { readonly kind: 'server'; readonly error: ApiClientError };

export type EnrollPhase =
  | { readonly status: 'editing'; readonly problem: EnrollProblem | null }
  | { readonly status: 'submitting'; readonly fullName: string }
  | { readonly status: 'created'; readonly account: AccountListItem; readonly employeeCode: string }
  | { readonly status: 'forbidden' };

const DEFAULTS: EnrollFormValues = { fullName: '', email: '', employeeCode: '' };
const EDITING: EnrollPhase = { status: 'editing', problem: null };

/**
 * El esquema del formulario: las mismas reglas que el de la API (el de `contracts`), con el rol que puede quedar sin
 * elegir (mockup, decisión 3). El grupo de radios vacío vale `null` y, como en la API, un rol sin elegir es `REQUIRED`.
 */
const enrollFormSchema = enrollInternalAccountRequestSchema.extend({
  role: z.preprocess(
    (value) => (value === null ? undefined : value),
    enrollInternalAccountRequestSchema.shape.role,
  ),
});

/** El `reason` del *issue* (el código del servidor), no su texto: un campo vacío es `REQUIRED` (011 CA-6). */
function reasonOf(issue: { readonly params?: { readonly reason?: unknown } }): string {
  const reason = issue.params?.reason;
  return typeof reason === 'string' ? reason : REQUIRED_REASON;
}

/**
 * Las reglas de la API (el esquema de `contracts`): un rol sin elegir es `REQUIRED` (el grupo de radios vacío vale
 * `null`), con los textos del alta. Cada *issue* trae su `reason` en `params`, así que el mensaje de cada campo sale
 * del código y no de comparar textos.
 */
const enrollResolver: Resolver<EnrollFormValues, unknown, EnrollInternalAccountRequest> = async (
  values,
  _context,
  _options,
) => {
  const result = enrollFormSchema.safeParse(values);
  if (result.success) return { values: result.data, errors: {} };
  const errors: FormErrors<EnrollFormValues> = {};
  for (const issue of result.error.issues) {
    if (issue.code !== 'custom') continue;
    const field = issue.path[0];
    if (!isEnrollField(field)) continue;
    errors[field] = {
      type: issue.code,
      message: enrollmentFieldMessage({
        field,
        reason: reasonOf(issue),
        message: issue.message,
      }),
    };
  }
  return { values: {}, errors };
};

function isEnrollField(field: string | number | undefined): field is EnrollField {
  return typeof field === 'string' && (ENROLL_FIELDS as readonly string[]).includes(field);
}

/** El primer `fields[]` de cada campo, con los textos del alta (011 CA-6). */
function serverFieldIssues(
  error: ApiClientError,
): readonly (FieldIssueResponse & { field: EnrollField })[] {
  const seen = new Set<string>();
  return error.fields.filter((issue): issue is FieldIssueResponse & { field: EnrollField } => {
    if (!isEnrollField(issue.field) || seen.has(issue.field)) return false;
    seen.add(issue.field);
    return true;
  });
}

/** Los mensajes visibles de cada campo, a partir de los errores del formulario. */
function messagesOf(errors: FormErrors<EnrollFormValues>): FieldErrors {
  const messages: Partial<Record<EnrollField, string>> = {};
  for (const field of ENROLL_FIELDS) {
    const message = errors[field]?.message;
    if (message !== undefined) messages[field] = message;
  }
  return messages;
}

export interface EnrollForm {
  readonly form: UseFormReturn<EnrollFormValues, unknown, EnrollInternalAccountRequest>;
  readonly errors: FieldErrors;
  readonly phase: EnrollPhase;
  readonly submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  /** «Crear otra cuenta»: formulario vacío y el foco en el nombre. */
  readonly reset: () => void;
}

type Form = EnrollForm['form'];

/** Rechazo del servidor: `fields` del `422` y del `409` en cada campo; lo escrito no se toca (CA-17). */
function rejectedPhase(caught: unknown, form: Form): EnrollPhase {
  if (isForbidden(caught)) return { status: 'forbidden' };
  const error = toApiClientError(caught);
  const issues = serverFieldIssues(error);
  if (issues.length === 0) return { status: 'editing', problem: { kind: 'server', error } };
  for (const issue of issues) {
    form.setError(issue.field, { type: 'server', message: enrollmentFieldMessage(issue) });
  }
  const kind = error.code === IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT ? 'conflict' : 'fields';
  return { status: 'editing', problem: { kind } };
}

/**
 * «Crear otra cuenta» vacía el formulario y, ya montado otra vez, enfoca el nombre. No reutiliza `useResetWithFocus`:
 * aquí `react-hook-form` vacía (`reset`) y enfoca (`setFocus`) sin volver a montar el formulario, y el `ref` del campo es
 * el de `register`; compartir aquel `inputRef` obligaría a fusionar los dos `ref`.
 */
function useResetAndFocus(form: Form, setPhase: (phase: EnrollPhase) => void): () => void {
  const [resets, setResets] = React.useState(0);
  const { setFocus } = form;
  React.useEffect(() => {
    if (resets > 0) setFocus('fullName');
  }, [resets, setFocus]);
  return () => {
    form.reset(DEFAULTS);
    setPhase(EDITING);
    setResets((previous) => previous + 1);
  };
}

/**
 * Estado y envío del alta interna (011 CA-5, CA-6) sobre `react-hook-form`, como los formularios de `identity`: valida
 * con el esquema de la API antes de enviar, no permite el doble envío y el foco va al resumen (no al primer campo).
 */
export function useEnrollForm(enroll: EnrollAccountCall): EnrollForm {
  const [phase, setPhase] = React.useState<EnrollPhase>(EDITING);
  const form = useForm<EnrollFormValues, unknown, EnrollInternalAccountRequest>({
    resolver: enrollResolver,
    defaultValues: DEFAULTS,
    shouldFocusError: false,
  });
  const reset = useResetAndFocus(form, setPhase);
  const send = async (request: EnrollInternalAccountRequest): Promise<void> => {
    setPhase({ status: 'submitting', fullName: request.fullName });
    try {
      const account = await enroll(request);
      // El resumen muestra lo que se escribió; el servicio lo guarda recortado y en mayúsculas (RN-5).
      setPhase({ status: 'created', account, employeeCode: request.employeeCode });
    } catch (caught) {
      setPhase(rejectedPhase(caught, form));
    }
  };
  const invalid = (): void => setPhase({ status: 'editing', problem: { kind: 'fields' } });
  const submit = form.handleSubmit(send, invalid);
  return { form, errors: messagesOf(form.formState.errors), phase, submit, reset };
}
