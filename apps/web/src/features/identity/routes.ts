/** Rutas de `identity` que la web enlaza desde varios componentes. */
export const LOGIN_PATH = '/iniciar-sesion';

/** `?sesion=terminada`: la sesión venció o se revocó (CA-8). */
export const SESSION_ENDED_PARAM = 'sesion';
export const SESSION_ENDED_VALUE = 'terminada';
export const SESSION_ENDED_PATH = `${LOGIN_PATH}?${SESSION_ENDED_PARAM}=${SESSION_ENDED_VALUE}`;
