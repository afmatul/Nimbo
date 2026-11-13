/** Rutas de `identity` que la web enlaza desde varios componentes. */
export const LOGIN_PATH = '/iniciar-sesion';

export const REGISTER_PATH = '/registro';

/** Parámetro del registro con el plan elegido en el catálogo público (`/registro?plan=pro`). */
export const REGISTER_PLAN_PARAM = 'plan';

export const registerWithPlanHref = (slug: string): string =>
  `${REGISTER_PATH}?${REGISTER_PLAN_PARAM}=${encodeURIComponent(slug)}`;

/** `?sesion=terminada`: la sesión venció o se revocó (CA-8). */
export const SESSION_ENDED_PARAM = 'sesion';
export const SESSION_ENDED_VALUE = 'terminada';
export const SESSION_ENDED_PATH = `${LOGIN_PATH}?${SESSION_ENDED_PARAM}=${SESSION_ENDED_VALUE}`;
