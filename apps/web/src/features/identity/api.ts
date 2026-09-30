import {
  acceptedResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  resetLinkCheckResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  resetTokenRequestSchema,
  sessionResponseSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  type AcceptedResponse,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResendVerificationRequest,
  type ResetLinkCheckResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type SessionResponse,
  type VerifyEmailResponse,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { requestJson } from '../../lib/api-client';
import { ApiClientError, genericErrorMessage } from '../../lib/api-error';

function endpoint(apiPublicUrl: string, path: string): string {
  return `${apiPublicUrl.replace(/\/$/, '')}${path}`;
}

function parseOrGeneric<T>(raw: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: genericErrorMessage(''),
      correlationId: '',
    });
  }
  return parsed.data;
}

/** `credentials: 'include'` solo donde viaja la cookie de refresco o de dispositivo (plan 002 §5). */
async function postJson<T>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  credentials?: RequestCredentials,
): Promise<T> {
  const raw = await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(credentials === undefined ? {} : { credentials }),
  });
  return parseOrGeneric(raw, schema);
}

/** `POST` sin cuerpo con la cookie de refresco (`session/*`). */
function postWithCookie(url: string): Promise<unknown> {
  return requestJson(url, { method: 'POST', credentials: 'include' });
}

export function register(apiPublicUrl: string, input: RegisterRequest): Promise<AcceptedResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/register'),
    registerRequestSchema.parse(input),
    acceptedResponseSchema,
  );
}

export function resendVerification(
  apiPublicUrl: string,
  input: ResendVerificationRequest,
): Promise<AcceptedResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/resend-verification'),
    resendVerificationRequestSchema.parse(input),
    acceptedResponseSchema,
  );
}

/** 002 CA-15: la apertura que verifica abre la sesión; la API deja las cookies de refresco y de dispositivo. */
export function verifyEmail(apiPublicUrl: string, token: string): Promise<VerifyEmailResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/verify-email'),
    verifyEmailRequestSchema.parse({ token }),
    verifyEmailResponseSchema,
    'include',
  );
}

/** CA-1: abre la sesión; la API deja las cookies `nimbo_rt` y `nimbo_did`. */
export function login(apiPublicUrl: string, input: LoginRequest): Promise<SessionResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/login'),
    loginRequestSchema.parse(input),
    sessionResponseSchema,
    'include',
  );
}

/** CA-7: renueva con la cookie de refresco y devuelve un token de acceso nuevo. */
export async function refresh(apiPublicUrl: string): Promise<SessionResponse> {
  const raw = await postWithCookie(endpoint(apiPublicUrl, '/auth/session/refresh'));
  return parseOrGeneric(raw, sessionResponseSchema);
}

/** Cierra la sesión de este navegador (idempotente, `204`). */
export async function logout(apiPublicUrl: string): Promise<void> {
  await postWithCookie(endpoint(apiPublicUrl, '/auth/session/logout'));
}

/** CA-18: pide el enlace de recuperación. La respuesta es la misma para cualquier correo. */
export function forgotPassword(
  apiPublicUrl: string,
  input: ForgotPasswordRequest,
): Promise<AcceptedResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/forgot-password'),
    forgotPasswordRequestSchema.parse(input),
    acceptedResponseSchema,
  );
}

/** CA-20: comprueba el enlace de recuperación sin consumirlo. */
export function checkResetLink(
  apiPublicUrl: string,
  token: string,
): Promise<ResetLinkCheckResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/reset-password/check'),
    resetTokenRequestSchema.parse({ token }),
    resetLinkCheckResponseSchema,
  );
}

/** CA-19: cambia la contraseña. La API borra la cookie de refresco de este navegador y no abre sesión. */
export function resetPassword(
  apiPublicUrl: string,
  input: ResetPasswordRequest,
): Promise<ResetPasswordResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/reset-password'),
    resetPasswordRequestSchema.parse(input),
    resetPasswordResponseSchema,
    'include',
  );
}
