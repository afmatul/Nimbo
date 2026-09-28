/** Parámetros de la spec 001 §6. Única fuente para `api` y `web` (Art. VI). */

/** Vigencia del enlace de verificación desde su emisión (D-7). */
export const VERIFICATION_LINK_TTL_HOURS = 24;
/** Espera mínima entre dos solicitudes de registro o reenvío para un mismo correo (D-8). */
export const EMAIL_REQUEST_COOLDOWN_SECONDS = 60;
/** Solicitudes de registro o reenvío por correo y por hora (D-8). */
export const EMAIL_REQUESTS_PER_HOUR = 5;
/** Solicitudes de registro por dirección IP y por hora (D-8). */
export const REGISTRATIONS_PER_IP_PER_HOUR = 10;
/** Intentos sobre un correo ya verificado que generan aviso a su dueño en 24 h (D-17). */
export const MAX_AVISOS_INTENTO_24H = 1;
/** Longitud máxima del nombre completo (D-5). */
export const FULL_NAME_MAX_LENGTH = 100;
/** Longitud mínima de la contraseña, en puntos de código (D-6). */
export const PASSWORD_MIN_LENGTH = 12;
/** Longitud máxima de la contraseña, en puntos de código (D-6). */
export const PASSWORD_MAX_LENGTH = 128;
