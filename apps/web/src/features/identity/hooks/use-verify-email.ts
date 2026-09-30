'use client';

import { IDENTITY_ERROR_CODES, type SessionResponse } from '@nimbo/contracts';
import { useCallback } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { verifyEmail } from '../api';
import { takeChosenPlan } from '../chosen-plan-storage';

import { useFragmentToken } from './use-fragment-token';

export type VerifyEmailViewState =
  | { readonly status: 'verificando' }
  | {
      readonly status: 'exito';
      readonly planName: string | null;
      /** La sesión que abrió la verificación (002 CA-15); sin ella, hay que iniciar sesión. */
      readonly session: SessionResponse | null;
    }
  | { readonly status: 'ya-verificado' }
  | { readonly status: 'enlace-expirado' }
  | { readonly status: 'enlace-invalido' };

const VERIFYING: VerifyEmailViewState = { status: 'verificando' };
const INVALID_LINK: VerifyEmailViewState = { status: 'enlace-invalido' };

async function resolveVerification(
  apiPublicUrl: string,
  token: string | null,
): Promise<VerifyEmailViewState> {
  if (token === null) return INVALID_LINK;
  try {
    const result = await verifyEmail(apiPublicUrl, token);
    if (result.status === 'already-verified') return { status: 'ya-verificado' };
    const plan = takeChosenPlan(window.localStorage, new Date());
    return { status: 'exito', planName: plan?.planName ?? null, session: result.session ?? null };
  } catch (caught) {
    if (
      caught instanceof ApiClientError &&
      caught.code === IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED
    ) {
      return { status: 'enlace-expirado' };
    }
    return INVALID_LINK;
  }
}

/** Lee `#token`, lo borra y verifica el correo una sola vez (también en `<StrictMode>`). */
export function useVerifyEmail(apiPublicUrl: string): VerifyEmailViewState {
  const resolve = useCallback(
    (token: string | null) => resolveVerification(apiPublicUrl, token),
    [apiPublicUrl],
  );
  return useFragmentToken(resolve) ?? VERIFYING;
}
