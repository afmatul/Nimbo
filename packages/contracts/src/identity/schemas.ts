import { z } from 'zod';

import { INTERNAL_ROLES, roleSchema, type InternalRoleName } from '../shared';

import { IDENTITY_FIELD_MESSAGES, type FieldIssueReason } from './error-codes';
import {
  EMAIL_MAX_LENGTH,
  EMPLOYEE_CODE_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  SESSION_LIST_MAX_ITEMS,
} from './parameters';
import { evaluatePassword } from './password-policy';

const emailFormat = z.string().email().max(EMAIL_MAX_LENGTH);

/** Única regla de formato de correo (Q-4b): la usan `identity` y `backoffice`. Recibe el correo ya recortado. */
export function isValidEmail(value: string): boolean {
  return emailFormat.safeParse(value).success;
}

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
  return isValidEmail(value.trim()) ? [] : ['INVALID_EMAIL'];
}

/** Mismas reglas que `EmployeeCode` del dominio de `api` (que no importa este paquete, ADR-0008). */
const EMPLOYEE_CODE_PATTERN = new RegExp(`^[A-Z0-9-]{1,${String(EMPLOYEE_CODE_MAX_LENGTH)}}$`);

/** El código se valida recortado y en mayúsculas, como lo guarda el servicio (RN-5, Q-4). */
function employeeCodeReasons(value: string): FieldIssueReason[] {
  const code = value.trim().toUpperCase();
  if (code === '') return ['REQUIRED'];
  return EMPLOYEE_CODE_PATTERN.test(code) ? [] : ['INVALID_EMPLOYEE_CODE'];
}

const INTERNAL_ROLE_SET: ReadonlySet<unknown> = new Set(INTERNAL_ROLES);

/** Solo un rol interno: `CLIENT` u otro valor es `INVALID_ROLE` (CA-6); ausente, `REQUIRED`. */
const internalRoleField = z.custom<InternalRoleName>().superRefine((value: unknown, ctx) => {
  if (value === undefined) addIssue(ctx, 'REQUIRED');
  else if (!INTERNAL_ROLE_SET.has(value)) addIssue(ctx, 'INVALID_ROLE');
});

const acceptTermsField = z.custom<true>().superRefine((value: unknown, ctx) => {
  if (value !== true) addIssue(ctx, 'TERMS_NOT_ACCEPTED');
});

function nonEmptyReasons(value: string): FieldIssueReason[] {
  return value === '' ? ['REQUIRED'] : [];
}

/** Reglas de D-6 sobre la contraseña; «igual al correo» solo se evalúa si llegó un correo de texto. */
function refinePassword(data: { password: unknown; email?: unknown }, ctx: Refinement): void {
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

/**
 * `POST /auth/login` (002 plan §5). Sin la política de contraseña: una contraseña que no la cumple es solo
 * incorrecta (CA-2).
 */
export const loginRequestSchema = z
  .object({ email: textField(emailReasons), password: textField(nonEmptyReasons) })
  .strict(UNKNOWN_FIELD_MESSAGE);

/** `POST /auth/forgot-password` (CA-18). */
export const forgotPasswordRequestSchema = z
  .object({ email: textField(emailReasons) })
  .strict(UNKNOWN_FIELD_MESSAGE);

/**
 * `POST /auth/reset-password/check`. Como en `verify-email`, un `token` mal formado lo rechaza el servicio con
 * `IDENTITY_RESET_LINK_INVALID` (CA-20).
 */
export const resetTokenRequestSchema = z
  .object({ token: textField() })
  .strict(UNKNOWN_FIELD_MESSAGE);

/**
 * `POST /auth/reset-password`: política D-6 de 001 salvo «igual al correo», que completa el servicio porque la
 * petición no trae el correo (CA-21).
 */
export const resetPasswordRequestSchema = z
  .object({ token: textField(), password: textField() })
  .strict(UNKNOWN_FIELD_MESSAGE)
  .superRefine(refinePassword);

/**
 * `POST /auth/change-password`. La confirmación solo existe en el cliente (D-7) y la política de la contraseña nueva
 * la aplica el servicio, que conoce el correo (CA-22).
 */
export const changePasswordRequestSchema = z
  .object({ currentPassword: textField(nonEmptyReasons), newPassword: textField() })
  .strict(UNKNOWN_FIELD_MESSAGE);

/**
 * `POST /backoffice/accounts` (011 plan §4): alta interna. Nombre y correo con las reglas del registro (Q-4b); el
 * código y el correo los normaliza el servicio. Responde `422 IDENTITY_INVALID_INPUT` con `fields` (CA-6).
 */
export const enrollInternalAccountRequestSchema = z
  .object({
    fullName: textField(fullNameReasons),
    email: textField(emailReasons),
    employeeCode: textField(employeeCodeReasons),
    role: internalRoleField,
  })
  .strict(UNKNOWN_FIELD_MESSAGE);

/**
 * `POST /auth/account-setup/check` y `POST /auth/account-setup` (011 CA-5): mismas formas que la recuperación de 002.
 * Un `token` mal formado lo rechaza el servicio con `IDENTITY_SETUP_LINK_INVALID`; «igual al correo» lo completa el
 * servicio, que conoce el correo.
 */
export const accountSetupCheckRequestSchema = resetTokenRequestSchema;
export const accountSetupRequestSchema = resetPasswordRequestSchema;

/** Respuesta neutra de `register` y `resend-verification` (spec §7). */
export const acceptedResponseSchema = z.object({ status: z.literal('accepted') }).strict();

/** Instante ISO-8601 en UTC (`Z`), sin desplazamiento. */
const utcInstant = z.string().datetime();

/**
 * Sesión recién abierta o renovada (002 plan §5). El `user` evita un `/me`; el correo va en el cuerpo, nunca en el
 * token (D-13).
 */
export const sessionResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    accessTokenExpiresAt: utcInstant,
    user: z
      .object({
        id: z.string().uuid(),
        fullName: z.string().min(1),
        email: z.string().email(),
        role: roleSchema,
      })
      .strict(),
  })
  .strict();

export const VERIFY_EMAIL_STATUSES = ['verified', 'already-verified'] as const;

/**
 * Respuesta de `verify-email`: `already-verified` no es un error (001 CA-10). Solo la apertura que verifica trae la
 * sesión (002 CA-1).
 */
export const verifyEmailResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('verified'), session: sessionResponseSchema.optional() }).strict(),
  z.object({ status: z.literal('already-verified') }).strict(),
]);

/** `POST /auth/reset-password/check`: el enlace sirve; no lo consume (CA-20). */
export const resetLinkCheckResponseSchema = z.object({ status: z.literal('valid') }).strict();

/** `POST /auth/account-setup/check`: el enlace de alta sirve; no lo consume (011 CA-5). */
export const accountSetupCheckResponseSchema = resetLinkCheckResponseSchema;

/** `POST /auth/account-setup`: la primera contraseña quedó fijada; no abre sesión ni toca otras (011 CA-5). */
export const accountSetupResponseSchema = z.object({ status: z.literal('password-set') }).strict();

/** `POST /auth/reset-password`: la contraseña cambió; no abre sesión (CA-19). */
export const resetPasswordResponseSchema = z
  .object({ status: z.literal('password-reset') })
  .strict();

export const DEVICE_KINDS = ['desktop', 'mobile', 'tablet'] as const;

/** Una sesión en «Seguridad». Sin IP, agente de usuario completo ni id del dispositivo (CA-11). */
export const sessionSummarySchema = z
  .object({
    id: z.string().uuid(),
    browser: z.string(),
    os: z.string(),
    deviceKind: z.enum(DEVICE_KINDS),
    startedAt: utcInstant,
    lastActiveAt: utcInstant,
    current: z.boolean(),
  })
  .strict();

/** `GET /sessions`: la actual primero y después por última actividad (D-9). */
export const sessionListResponseSchema = z
  .object({ items: z.array(sessionSummarySchema).max(SESSION_LIST_MAX_ITEMS) })
  .strict();

/** `POST /sessions/revoke-others` (CA-13). */
export const revokeOthersResponseSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetTokenRequest = z.infer<typeof resetTokenRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type EnrollInternalAccountRequest = z.infer<typeof enrollInternalAccountRequestSchema>;
export type AccountSetupCheckRequest = z.infer<typeof accountSetupCheckRequestSchema>;
export type AccountSetupRequest = z.infer<typeof accountSetupRequestSchema>;
export type AccountSetupCheckResponse = z.infer<typeof accountSetupCheckResponseSchema>;
export type AccountSetupResponse = z.infer<typeof accountSetupResponseSchema>;
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type VerifyEmailStatus = VerifyEmailResponse['status'];
export type ResetLinkCheckResponse = z.infer<typeof resetLinkCheckResponseSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionUser = SessionResponse['user'];
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
export type RevokeOthersResponse = z.infer<typeof revokeOthersResponseSchema>;
