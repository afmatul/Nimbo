import { DEVICE_COOKIE_MAX_AGE_DAYS } from '@nimbo/contracts';
import type { CookieOptions, Response } from 'express';

/** Token de refresco (`<sid>.<secreto>`): solo viaja a renovar y cerrar sesión (D-1). */
export const REFRESH_COOKIE = 'nimbo_rt';
/** Secreto del dispositivo: solo viaja a las rutas que abren sesión (D-4). */
export const DEVICE_COOKIE = 'nimbo_did';

/** Rutas con el prefijo global `api/v1` de `configureHttpApp`: el navegador compara la URL completa. */
const REFRESH_COOKIE_PATH = '/api/v1/auth/session';
const DEVICE_COOKIE_PATH = '/api/v1/auth';
const MS_PER_DAY = 86_400_000;
const DEVICE_COOKIE_MAX_AGE_MS = DEVICE_COOKIE_MAX_AGE_DAYS * MS_PER_DAY;

/** Valores que emite `identity`: base64url y, en el token de refresco, el punto que separa `sid` y secreto. */
const COOKIE_VALUE = /^[A-Za-z0-9_.-]+$/;

/**
 * Única fuente de nombres y opciones de las cookies de sesión (plan §6.5, DT-2). `HttpOnly` y `SameSite=Strict`
 * siempre; `Secure` solo en staging y producción (`cookieSecure`), porque en local la API se sirve por HTTP.
 */
export class SessionCookies {
  constructor(private readonly secure: boolean) {}

  /** `maxAgeMs` es `IssuedSession.refreshMaxAge`: nunca pasa de lo que le queda a la sesión (RN-5). */
  setRefresh(res: Response, value: string, maxAgeMs: number): void {
    res.cookie(REFRESH_COOKIE, value, { ...this.options(REFRESH_COOKIE_PATH), maxAge: maxAgeMs });
  }

  setDevice(res: Response, value: string): void {
    res.cookie(DEVICE_COOKIE, value, {
      ...this.options(DEVICE_COOKIE_PATH),
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    });
  }

  /** Nunca ante `IDENTITY_REFRESH_INVALID`: en una carrera entre pestañas la cookie ya puede ser la nueva. */
  clearRefresh(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.options(REFRESH_COOKIE_PATH));
  }

  private options(path: string): CookieOptions {
    return { httpOnly: true, sameSite: 'strict', secure: this.secure, path };
  }
}

/** Cabeceras de la petición; basta con `req` de Express. */
export interface CookieCarrier {
  readonly headers: { readonly cookie?: string | undefined };
}

/**
 * Lector mínimo de la cabecera `Cookie` (DT-9): el valor de `name` si aparece una sola vez y con el alfabeto de
 * `identity`; si falta, se repite o trae otro carácter, `undefined`.
 */
export const readCookie = (req: CookieCarrier, name: string): string | undefined => {
  const values = (req.headers.cookie ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.startsWith(`${name}=`))
    .map((pair) => pair.slice(name.length + 1));
  const [value] = values;
  return values.length === 1 && value !== undefined && COOKIE_VALUE.test(value) ? value : undefined;
};
