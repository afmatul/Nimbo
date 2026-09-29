import {
  acceptedResponseSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
  type AcceptedResponse,
  type RegisterRequest,
  type ResendVerificationRequest,
  type VerifyEmailResponse,
} from '@nimbo/contracts';
import type { ZodType } from 'zod';

import { requestJson } from '../../lib/api-client';
import { ApiClientError, genericErrorMessage } from '../../lib/api-error';

function endpoint(apiPublicUrl: string, path: string): string {
  return `${apiPublicUrl.replace(/\/$/, '')}${path}`;
}

async function postJson<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const raw = await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

export function verifyEmail(apiPublicUrl: string, token: string): Promise<VerifyEmailResponse> {
  return postJson(
    endpoint(apiPublicUrl, '/auth/verify-email'),
    verifyEmailRequestSchema.parse({ token }),
    verifyEmailResponseSchema,
  );
}
