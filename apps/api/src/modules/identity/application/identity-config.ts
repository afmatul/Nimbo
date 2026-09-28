/** Configuración de `identity` tomada del entorno validado (plan §6.1): la base de los enlaces de los correos. */
export interface IdentityConfig {
  /** `WEB_PUBLIC_URL` tal como está en el entorno (puede traer barra final; quien arma enlaces la quita). */
  readonly webPublicUrl: string;
}

export const IDENTITY_CONFIG = Symbol('IDENTITY_CONFIG');
