import type { IdentityConfig } from './identity-config';

/** Rutas de `web` a las que apuntan los correos de `identity`. */
export const WEB_PATHS = {
  verifyEmail: '/verificar-correo',
  login: '/iniciar-sesion',
  /** La confirma 002 (recuperación de contraseña); hasta entonces la página no existe. */
  passwordRecovery: '/recuperar-contrasena',
  /** «Seguridad»: sesiones abiertas y cambio de contraseña (spec 002 §11). */
  security: '/cuenta/seguridad',
} as const;

const TRAILING_SLASHES = /\/+$/;

/** URL pública de `web` para `path`, sin duplicar la barra si `WEB_PUBLIC_URL` termina en «/». */
export const webUrl = (config: IdentityConfig, path: string): string =>
  `${config.webPublicUrl.replace(TRAILING_SLASHES, '')}${path}`;
