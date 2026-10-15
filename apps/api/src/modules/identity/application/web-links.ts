import type { OpaqueToken } from '../domain/opaque-token.vo';

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
  /** Crear la primera contraseña de una cuenta interna; el token va en el fragmento (011 CA-5). */
  accountSetup: '/crear-contrasena',
} as const;

const TRAILING_SLASHES = /\/+$/;

/** URL pública de `web` para `path`, sin duplicar la barra si `WEB_PUBLIC_URL` termina en «/». */
export const webUrl = (config: IdentityConfig, path: string): string =>
  `${config.webPublicUrl.replace(TRAILING_SLASHES, '')}${path}`;

/**
 * Enlace de cuenta de un solo uso: el token va solo en el fragmento, que el navegador no envía al servidor ni deja en
 * las bitácoras (001 R-2, 002 CA-19, 011 CA-5).
 */
export const tokenLink = (config: IdentityConfig, path: string, token: OpaqueToken): string =>
  webUrl(config, `${path}#token=${token.toString()}`);
