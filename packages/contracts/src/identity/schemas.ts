import { z } from 'zod';

import { IDENTITY_FIELD_MESSAGES, type FieldIssueReason } from './error-codes';
import { FULL_NAME_MAX_LENGTH } from './parameters';
import { evaluatePassword } from './password-policy';

/** Largo máximo de una dirección de correo (RFC 5321; columna `usuario.correo varchar(254)`). */
const EMAIL_MAX_LENGTH = 254;

const emailFormat = z.string().email().max(EMAIL_MAX_LENGTH);

type Refinement = z.RefinementCtx;

function addIssue(ctx: Refinement, reason: FieldIssueReason, path: (string | number)[] = []): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: IDENTITY_FIELD_MESSAGES[reason],
    params: { reason },
  });
}

/**
 * Campo de texto cuyo `reason` fija el propio esquema: ausente o de otro tipo es `REQUIRED`, y `validate` devuelve
 * los `reason` de las reglas que no cumple. Así cada regla es un *issue* propio con su mensaje (ADR-0020).
 */
function textField(validate: (value: string) => FieldIssueReason[] = () => []) {
  return z.custom<string>().superRefine((value: unknown, ctx) => {
    if (typeof value !== 'string') {
      addIssue(ctx, 'REQUIRED');
      return;
    }
    for (const reason of validate(value)) addIssue(ctx, reason);
  });
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function fullNameReasons(value: string): FieldIssueReason[] {
  if (value.trim() === '') return ['REQUIRED'];
  return codePointLength(value) > FULL_NAME_MAX_LENGTH ? ['TOO_LONG'] : [];
}

/** El correo se valida sin espacios alrededor; la normalización la hace el servicio (D-16). */
function emailReasons(value: string): FieldIssueReason[] {
  return emailFormat.safeParse(value.trim()).success ? [] : ['INVALID_EMAIL'];
}

const acceptTermsField = z.custom<true>().superRefine((value: unknown, ctx) => {
  if (value !== true) addIssue(ctx, 'TERMS_NOT_ACCEPTED');
});

/** Reglas de D-6 sobre la contraseña; «igual al correo» solo se evalúa si llegó un correo de texto. */
function refinePassword(data: { password: unknown; email: unknown }, ctx: Refinement): void {
  if (typeof data.password !== 'string') return;
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const hasEmail = email !== '';
  for (const result of evaluatePassword(data.password, email)) {
    if (result.passed || (result.rule === 'notEmail' && !hasEmail)) continue;
    addIssue(ctx, result.reason, ['password']);
  }
}

const UNKNOWN_FIELD_MESSAGE = IDENTITY_FIELD_MESSAGES.UNKNOWN_FIELD;

/** `POST /auth/register` (plan §5). Estricto: cualquier otra clave es `UNKNOWN_FIELD` (CA-7). */
export const registerRequestSchema = z
  .object({
    fullName: textField(fullNameReasons),
    email: textField(emailReasons),
    password: textField(),
    acceptTerms: acceptTermsField,
  })
  .strict(UNKNOWN_FIELD_MESSAGE)
  .superRefine(refinePassword);

/** `POST /auth/resend-verification`. */
export const resendVerificationRequestSchema = z
  .object({ email: textField(emailReasons) })
  .strict(UNKNOWN_FIELD_MESSAGE);

/**
 * `POST /auth/verify-email`. El `token` no lleva reglas de formato: uno vacío o mal formado lo rechaza el servicio
 * con `IDENTITY_VERIFICATION_LINK_INVALID` (CA-11 b).
 */
export const verifyEmailRequestSchema = z
  .object({ token: textField() })
  .strict(UNKNOWN_FIELD_MESSAGE);

/** Respuesta neutra de `register` y `resend-verification` (spec §7). */
export const acceptedResponseSchema = z.object({ status: z.literal('accepted') }).strict();

export const VERIFY_EMAIL_STATUSES = ['verified', 'already-verified'] as const;

/** Respuesta de `verify-email`: `already-verified` no es un error (CA-10). */
export const verifyEmailResponseSchema = z
  .object({ status: z.enum(VERIFY_EMAIL_STATUSES) })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type VerifyEmailStatus = VerifyEmailResponse['status'];
