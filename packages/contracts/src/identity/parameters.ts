/** Parámetros de las specs 001 §6 y 002 §6. Única fuente para `api` y `web` (Art. VI). */

/** Vigencia del enlace de verificación desde su emisión (D-7). */
export const VERIFICATION_LINK_TTL_HOURS = 24;
/** Espera mínima entre dos solicitudes de registro o reenvío para un mismo correo (D-8). */
export const EMAIL_REQUEST_COOLDOWN_SECONDS = 60;
/** Solicitudes de registro o reenvío por correo y por hora (D-8). */
export const EMAIL_REQUESTS_PER_HOUR = 5;
/** Solicitudes de registro por dirección IP y por hora (D-8). */
export const REGISTRATIONS_PER_IP_PER_HOUR = 10;
/** Solicitudes de reenvío por dirección IP y por hora, contadas aparte de las de registro (D-8, SEC-1). */
export const RESENDS_PER_IP_PER_HOUR = 10;
/** Intentos sobre un correo ya verificado que generan aviso a su dueño en 24 h (D-17). */
export const MAX_AVISOS_INTENTO_24H = 1;
/** Vigencia del enlace de alta interna para crear la primera contraseña (011 Q-4, CA-5). */
export const ACCOUNT_SETUP_LINK_TTL_HOURS = 24;
/** Longitud máxima del código de empleado de una cuenta interna (011 Q-4, RN-5). */
export const EMPLOYEE_CODE_MAX_LENGTH = 20;
/** Longitud máxima del nombre completo (D-5). */
export const FULL_NAME_MAX_LENGTH = 100;
/** Longitud mínima de la contraseña, en puntos de código (D-6). */
export const PASSWORD_MIN_LENGTH = 12;
/** Longitud máxima de la contraseña, en puntos de código (D-6). */
export const PASSWORD_MAX_LENGTH = 128;

/*
 * Spec 002 §6. La recuperación de contraseña no tiene límites propios: reutiliza
 * `EMAIL_REQUEST_COOLDOWN_SECONDS` y `EMAIL_REQUESTS_PER_HOUR` (D-6).
 */

/** Vigencia del token de acceso (D-2). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;
/** Días sin renovar tras los que la sesión vence por inactividad (D-2). */
export const SESSION_IDLE_TIMEOUT_DAYS = 7;
/** Vida máxima de una sesión desde que se inicia, aunque se use a diario (D-2). */
export const SESSION_MAX_LIFETIME_DAYS = 30;
/** Gracia tras rotar el token de refresco en la que el anterior no revoca la sesión (D-3). */
export const REFRESH_ROTATION_GRACE_SECONDS = 10;
/** Intentos fallidos por correo normalizado, exista o no la cuenta, antes de bloquearlo (D-5). */
export const LOGIN_MAX_FAILURES = 5;
/** Ventana en la que se cuentan los intentos fallidos de un correo (D-5). */
export const LOGIN_FAILURE_WINDOW_MINUTES = 15;
/** Duración del bloqueo de inicio de sesión de un correo (D-5). */
export const LOGIN_LOCK_MINUTES = 15;
/** Intentos de inicio de sesión por dirección IP en la ventana (D-5). */
export const LOGIN_ATTEMPTS_PER_IP = 20;
/** Ventana de los intentos de inicio de sesión por dirección IP (D-5). */
export const LOGIN_IP_WINDOW_MINUTES = 15;
/** Vigencia del enlace de recuperación desde su emisión (D-6). */
export const RESET_LINK_TTL_MINUTES = 60;
/** Contraseñas actuales incorrectas seguidas al cambiarla antes de bloquear el cambio (D-7). */
export const PASSWORD_CHANGE_MAX_FAILURES = 5;
/** Ventana en la que se cuentan las contraseñas actuales incorrectas (D-7). */
export const PASSWORD_CHANGE_WINDOW_MINUTES = 15;
/** Duración del bloqueo del cambio de contraseña (D-7). */
export const PASSWORD_CHANGE_LOCK_MINUTES = 15;
/** Vida de la cookie que identifica el dispositivo (D-4). */
export const DEVICE_COOKIE_MAX_AGE_DAYS = 365;
/** Sesiones que devuelve como máximo la lista de «Seguridad» (plan 002 DT-13). */
export const SESSION_LIST_MAX_ITEMS = 50;
