import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';

import { Argon2idHasher } from '../../../src/modules/identity/infrastructure/argon2id.hasher';

export const LOGIN_PATH = '/api/v1/auth/login';
export const REFRESH_PATH = '/api/v1/auth/session/refresh';
export const LOGOUT_PATH = '/api/v1/auth/session/logout';
export const FORGOT_PASSWORD_PATH = '/api/v1/auth/forgot-password';
export const RESET_PASSWORD_CHECK_PATH = '/api/v1/auth/reset-password/check';
export const RESET_PASSWORD_PATH = '/api/v1/auth/reset-password';

/** Contraseña de las cuentas de prueba del inicio de sesión (cumple la política de 001). */
export const ACCOUNT_PASSWORD = 'Nimbo-Seguro-2026';

export interface AccountOptions {
  readonly verified?: boolean;
  readonly status?: 'activa' | 'suspendida';
  readonly role?: 'CLIENT' | 'ADMIN' | 'SUPPORT' | 'OPERATOR';
}

export interface Account {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

const hasher = new Argon2idHasher();
let passwordPhc: Promise<string> | undefined;

/** El hash de Argon2id de `ACCOUNT_PASSWORD` se calcula una vez por suite. */
const accountPasswordPhc = (): Promise<string> => {
  passwordPhc ??= hasher.hash(ACCOUNT_PASSWORD).then((hash) => hash.reveal());
  return passwordPhc;
};

/**
 * Cuenta lista para iniciar sesión, insertada con SQL (plan 001 §4): verificada y activa salvo que se pida otra cosa.
 * Los clientes llevan la aceptación legal que exige el esquema; las internas no.
 */
export const insertAccount = async (
  dataSource: DataSource,
  { verified = true, status = 'activa', role = 'CLIENT' }: AccountOptions = {},
): Promise<Account> => {
  const account = {
    id: randomUUID(),
    email: `cuenta-${randomUUID()}@nimbo.me`,
    fullName: 'Lucía Pérez',
  };
  const isClient = role === 'CLIENT';
  await dataSource.query(
    `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, estado, correo_verificado, version_terminos,
       version_privacidad, terminos_aceptados_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      account.id,
      account.fullName,
      account.email,
      await accountPasswordPhc(),
      role,
      status,
      verified,
      isClient ? '1.0' : null,
      isClient ? '1.0' : null,
      isClient ? new Date() : null,
    ],
  );
  return account;
};

/** Valor de una cookie en los `Set-Cookie` de una respuesta, o `undefined`. */
export const setCookie = (
  headers: Record<string, unknown>,
  name: string,
): { readonly value: string; readonly attributes: readonly string[] } | undefined => {
  const cookies = (headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((line) => line.startsWith(`${name}=`));
  if (cookie === undefined) return undefined;
  const [pair = '', ...attributes] = cookie.split('; ');
  return {
    value: pair.slice(name.length + 1),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
};

/** Cabecera `Cookie` con los pares `nombre=valor` dados. */
export const cookieHeader = (cookies: Readonly<Record<string, string>>): string =>
  Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

export interface SignedIn {
  readonly account: Account;
  readonly refreshToken: string;
  readonly sessionId: string;
}

/** Crea una cuenta verificada, inicia sesión (`200`) y devuelve el valor de `nimbo_rt` y el id de su sesión. */
export const signIn = async (server: App, dataSource: DataSource): Promise<SignedIn> => {
  const account = await insertAccount(dataSource);
  const response = await request(server)
    .post(LOGIN_PATH)
    .send({ email: account.email, password: ACCOUNT_PASSWORD })
    .expect(200);
  const refreshToken = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
  return { account, refreshToken, sessionId: refreshToken.split('.')[0] ?? '' };
};
