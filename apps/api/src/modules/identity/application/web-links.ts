import type { IdentityConfig } from './identity-config';

/** Rutas de `web` a las que apuntan los correos de `identity`. */
export const WEB_PATHS = {
  verifyEmail: '/verificar-correo',
  login: '/iniciar-sesion',
  /** Pedir el enlace de recuperación (002 §11). */
  passwordRecovery: '/recuperar-contrasena',
  /** Elegir la contraseña nueva; el token va en el fragmento (002 CA-19). */
  passwordReset: '/restablecer-contrasena',
  /** «Seguridad»: sesiones abiertas y cambio de contraseña (spec 002 §11). */
  security: '/cuenta/seguridad',
} as const;

const TRAILING_SLASHES = /\/+$/;

/** URL pública de `web` para `path`, sin duplicar la barra si `WEB_PUBLIC_URL` termina en «/». */
export const webUrl = (config: IdentityConfig, path: string): string =>
  `${config.webPublicUrl.replace(TRAILING_SLASHES, '')}${path}`;
