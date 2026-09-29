'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { verifyEmail } from '../api';
import { takeChosenPlan } from '../chosen-plan-storage';

export type VerifyEmailViewState =
  | { readonly status: 'verificando' }
  | { readonly status: 'exito'; readonly planName: string | null }
  | { readonly status: 'ya-verificado' }
  | { readonly status: 'enlace-expirado' }
  | { readonly status: 'enlace-invalido' };

function readFragmentToken(): string | null {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(raw).get('token');
  return token === null || token === '' ? null : token;
}

function stripFragment(): void {
  if (window.location.hash === '') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', next);
}

async function resolveVerification(
  apiPublicUrl: string,
  token: string,
): Promise<VerifyEmailViewState> {
  try {
    const result = await verifyEmail(apiPublicUrl, token);
    if (result.status === 'already-verified') return { status: 'ya-verificado' };
    const plan = takeChosenPlan(window.localStorage, new Date());
    return { status: 'exito', planName: plan?.planName ?? null };
  } catch (caught) {
    if (
      caught instanceof ApiClientError &&
      caught.code === IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED
    ) {
      return { status: 'enlace-expirado' };
    }
    return { status: 'enlace-invalido' };
  }
}

interface Verification {
  readonly token: string | null;
  readonly flight: Promise<VerifyEmailViewState>;
}

const INVALID_LINK: VerifyEmailViewState = { status: 'enlace-invalido' };

/**
 * Lee `#token`, lo borra y verifica. La verificación en curso vive en un `ref` del componente: el
 * segundo montaje de `<StrictMode>` la reutiliza y el `POST` no se repite. Si la pestaña ya está en
 * la página y llega otro `#token` (`hashchange`), se verifica ese token nuevo.
 */
export function useVerifyEmail(apiPublicUrl: string): VerifyEmailViewState {
  const [state, setState] = useState<VerifyEmailViewState>({ status: 'verificando' });
  const current = useRef<Verification | null>(null);

  useEffect(() => {
    let active = true;

    const follow = (verification: Verification): void => {
      void verification.flight.then((next) => {
        if (active && current.current === verification) setState(next);
      });
    };

    const start = (token: string | null): void => {
      stripFragment();
      const verification: Verification = {
        token,
        flight:
          token === null ? Promise.resolve(INVALID_LINK) : resolveVerification(apiPublicUrl, token),
      };
      current.current = verification;
      follow(verification);
    };

    const onHashChange = (): void => {
      const token = readFragmentToken();
      if (token === null) return;
      if (token === current.current?.token) {
        stripFragment();
        return;
      }
      setState({ status: 'verificando' });
      start(token);
    };

    if (current.current === null) start(readFragmentToken());
    else follow(current.current);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      active = false;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [apiPublicUrl]);

  return state;
}
