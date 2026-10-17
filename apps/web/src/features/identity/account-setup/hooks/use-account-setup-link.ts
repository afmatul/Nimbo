'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { useCallback } from 'react';

import { ApiClientError } from '../../../../lib/api-error';
import { useFragmentToken } from '../../hooks/use-fragment-token';
import { checkAccountSetupLink } from '../api';

/** Rechazos del enlace de alta, con los nombres de estado de la spec 011 §6. */
export type SetupLinkProblem = 'enlace-vencido' | 'enlace-invalido';

export type AccountSetupLinkState =
  | { readonly status: 'verificando' }
  | { readonly status: 'valido'; readonly token: string }
  | { readonly status: SetupLinkProblem };

const CHECKING: AccountSetupLinkState = { status: 'verificando' };
const INVALID_LINK: AccountSetupLinkState = { status: 'enlace-invalido' };

/** El rechazo del enlace de alta que trae un error, o `null` si el error es otro. */
export function setupLinkProblemOf(caught: unknown): SetupLinkProblem | null {
  if (!(caught instanceof ApiClientError)) return null;
  if (caught.code === IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED) return 'enlace-vencido';
  if (caught.code === IDENTITY_ERROR_CODES.SETUP_LINK_INVALID) return 'enlace-invalido';
  return null;
}

/**
 * 2.ª copia de `use-reset-link` (002): igual que allí, un 5xx o un fallo de red termina en `enlace-invalido`; se corrige
 * al unificar los dos flujos (PD-100).
 */
async function resolveSetupLink(
  apiPublicUrl: string,
  token: string | null,
): Promise<AccountSetupLinkState> {
  if (token === null) return INVALID_LINK;
  try {
    await checkAccountSetupLink(apiPublicUrl, token);
    return { status: 'valido', token };
  } catch (caught) {
    return { status: setupLinkProblemOf(caught) ?? 'enlace-invalido' };
  }
}

/** Lee `#token`, lo borra de la URL y comprueba el enlace de alta una sola vez, sin consumirlo (011 CA-5). */
export function useAccountSetupLink(apiPublicUrl: string): AccountSetupLinkState {
  const resolve = useCallback(
    (token: string | null) => resolveSetupLink(apiPublicUrl, token),
    [apiPublicUrl],
  );
  return useFragmentToken(resolve) ?? CHECKING;
}
