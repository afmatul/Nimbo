'use client';

import { IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { useEffect, useState } from 'react';

import { ApiClientError } from '../../../lib/api-error';
import { verifyEmail } from '../api';
import { takeChosenPlan } from '../chosen-plan-storage';

export type VerifyEmailViewState =
  | { readonly status: 'verificando' }
  | { readonly status: 'exito'; readonly planName: string | null }
  | { readonly status: 'ya-verificado' }
  | { readonly status: 'enlace-expirado' }
  | { readonly status: 'enlace-invalido' };

/**
 * El fragmento se lee una sola vez por carga. StrictMode vuelve a montar el efecto en el mismo
 * documento; la promesa se comparte para que el `POST` no se repita. Una recarga real empieza de cero
 * y, sin fragmento, cae en enlace-invalido.
 */
let rememberedToken: string | null | undefined;
const flights = new Map<string, Promise<VerifyEmailViewState>>();

export function resetVerifyEmailState(): void {
  rememberedToken = undefined;
  flights.clear();
}

function readTokenOnce(): string | null {
  if (rememberedToken !== undefined) return rememberedToken;
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const token = new URLSearchParams(raw).get('token');
  rememberedToken = token === null || token === '' ? null : token;
  return rememberedToken;
}

function stripFragment(): void {
  if (window.location.hash === '') return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', next);
}

async function resolveVerification(apiPublicUrl: string, token: string): Promise<VerifyEmailViewState> {
  try {
    const result = await verifyEmail(apiPublicUrl, token);
    if (result.status === 'already-verified') return { status: 'ya-verificado' };
    const plan = takeChosenPlan(window.localStorage, new Date());
    return { status: 'exito', planName: plan?.planName ?? null };
  } catch (caught) {
    if (caught instanceof ApiClientError && caught.code === IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED) {
      return { status: 'enlace-expirado' };
    }
    return { status: 'enlace-invalido' };
  }
}

function verificationFlight(apiPublicUrl: string, token: string): Promise<VerifyEmailViewState> {
  const key = `${apiPublicUrl}\n${token}`;
  const existing = flights.get(key);
  if (existing !== undefined) return existing;
  const flight = resolveVerification(apiPublicUrl, token);
  flights.set(key, flight);
  return flight;
}

/** Lee `#token`, lo borra y verifica una sola vez. */
export function useVerifyEmail(apiPublicUrl: string): VerifyEmailViewState {
  const [state, setState] = useState<VerifyEmailViewState>({ status: 'verificando' });

  useEffect(() => {
    let active = true;
    const token = readTokenOnce();
    stripFragment();
    if (token === null) {
      setState({ status: 'enlace-invalido' });
      return undefined;
    }
    void verificationFlight(apiPublicUrl, token).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [apiPublicUrl]);

  return state;
}
