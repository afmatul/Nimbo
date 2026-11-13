import {
  acceptedResponseSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  resetLinkCheckResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  resetTokenRequestSchema,
  revokeOthersResponseSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  type AcceptedResponse,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResendVerificationRequest,
  type ResetLinkCheckResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type RevokeOthersResponse,
  type SessionListResponse,
  type SessionResponse,
  type VerifyEmailResponse,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { requestJson } from '../../lib/api-client';
import { ApiClientError, genericErrorMessage } from '../../lib/api-error';

import type { AuthFetch } from './session/auth-fetch';

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

/** Registro con el plan elegido en el paso «Plan» (`planSlug`, solo si es de pago). */
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

/** CA-11: sesiones abiertas de la cuenta, la actual primero. */
export async function listSessions(
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<SessionListResponse> {
  const raw = await authFetch(endpoint(apiPublicUrl, '/sessions'), { method: 'GET' });
  return parseOrGeneric(raw, sessionListResponseSchema);
}

/**
 * CA-12, CA-14: cierra una sesión (`204`). Con credenciales para que, si es la actual, el navegador acepte el borrado
 * de la cookie de refresco.
 */
export async function revokeSession(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  sessionId: string,
): Promise<void> {
  const url = endpoint(apiPublicUrl, `/sessions/${encodeURIComponent(sessionId)}`);
  await authFetch(url, { method: 'DELETE', credentials: 'include' });
}

/** CA-13: cierra todas las sesiones salvo la actual y devuelve cuántas cerró. */
export async function revokeOtherSessions(
  apiPublicUrl: string,
  authFetch: AuthFetch,
): Promise<RevokeOthersResponse> {
  const raw = await authFetch(endpoint(apiPublicUrl, '/sessions/revoke-others'), {
    method: 'POST',
  });
  return parseOrGeneric(raw, revokeOthersResponseSchema);
}

/** CA-22: cambia la contraseña (`204`); la API cierra las demás sesiones y conserva la actual. */
export async function changePassword(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  input: ChangePasswordRequest,
): Promise<void> {
  await authFetch(endpoint(apiPublicUrl, '/auth/change-password'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changePasswordRequestSchema.parse(input)),
  });
}
