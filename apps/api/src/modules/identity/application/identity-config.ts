/** Ambientes publicados: la API se sirve por HTTPS y las cookies llevan `Secure` (plan 002 §6.5). */
const PUBLISHED_ENVIRONMENTS: readonly string[] = ['staging', 'production'];

/** Configuración de `identity` tomada del entorno validado (plan 001 §6.1, plan 002 §6.8). */
export interface IdentityConfig {
  /** `WEB_PUBLIC_URL` tal como está en el entorno (puede traer barra final; quien arma enlaces la quita). */
  readonly webPublicUrl: string;
  /** Las cookies `nimbo_rt` y `nimbo_did` llevan `Secure` (staging y producción). */
  readonly cookieSecure: boolean;
}

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');

export const identityConfigFrom = (env: {
  readonly WEB_PUBLIC_URL: string;
  readonly APP_ENV: string;
}): IdentityConfig => ({
  webPublicUrl: env.WEB_PUBLIC_URL,
  cookieSecure: PUBLISHED_ENVIRONMENTS.includes(env.APP_ENV),
});
