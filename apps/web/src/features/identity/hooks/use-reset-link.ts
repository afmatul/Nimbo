'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { useCallback } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { checkResetLink } from '../api';
import type { LinkProblem } from '../components/link-problem-card';

import { useFragmentToken } from './use-fragment-token';

export type ResetLinkState =
  | { readonly status: 'verificando' }
  | { readonly status: 'valido'; readonly token: string }
  | { readonly status: LinkProblem };

const CHECKING: ResetLinkState = { status: 'verificando' };
const INVALID_LINK: ResetLinkState = { status: 'enlace-invalido' };

/** El rechazo del enlace de recuperación que trae un error (CA-20), o `null` si el error es otro. */
export function resetLinkProblemOf(caught: unknown): LinkProblem | null {
  if (!(caught instanceof ApiClientError)) return null;
  if (caught.code === IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED) return 'enlace-expirado';
  if (caught.code === IDENTITY_ERROR_CODES.RESET_LINK_INVALID) return 'enlace-invalido';
  return null;
}

async function resolveResetLink(
  apiPublicUrl: string,
  token: string | null,
): Promise<ResetLinkState> {
  if (token === null) return INVALID_LINK;
  try {
    await checkResetLink(apiPublicUrl, token);
    return { status: 'valido', token };
  } catch (caught) {
    return { status: resetLinkProblemOf(caught) ?? 'enlace-invalido' };
  }
}

/** Lee `#token`, lo borra y comprueba el enlace de recuperación una sola vez, sin consumirlo (CA-20). */
export function useResetLink(apiPublicUrl: string): ResetLinkState {
  const resolve = useCallback(
    (token: string | null) => resolveResetLink(apiPublicUrl, token),
    [apiPublicUrl],
  );
  return useFragmentToken(resolve) ?? CHECKING;
}
