import { z } from 'zod';

import { SECRET_KEYS as SECRET_KEY_LIST } from './secret-keys';

export type { SecretKey } from './secret-keys';

const PORT_MESSAGE = 'debe ser un entero entre 1 y 65535';
const URL_MESSAGE = 'debe ser una URL válida';
const EMPTY_MESSAGE = 'no puede estar vacía';
const URL_LIST_MESSAGE = 'debe ser una lista de URL separadas por comas';
const HTTPS_MESSAGE = 'debe usar https en staging y en producción';
const SMTP_TLS_MESSAGE = 'no puede ser `none` en staging ni en producción';
const SMTP_USER_MESSAGE = 'es obligatoria si se define `SMTP_PASSWORD`';
const JWT_SECRET_MIN_LENGTH = 32;
/** 32 bytes aleatorios en base64url: el mínimo en ambientes publicados (plan 002 §6.10). */
const PUBLISHED_JWT_SECRET_MIN_LENGTH = 43;
const JWT_SECRET_LENGTH_MESSAGE = `debe tener al menos ${String(JWT_SECRET_MIN_LENGTH)} caracteres`;
const PUBLISHED_JWT_SECRET_LENGTH_MESSAGE = `debe tener al menos ${String(PUBLISHED_JWT_SECRET_MIN_LENGTH)} caracteres en staging y en producción`;
const LOCAL_JWT_SECRET_MESSAGE = 'no puede ser el valor de desarrollo de .env.example';

const DEFAULT_API_PORT = 3000;
const DEFAULT_WORKER_PORT = 3001;
const DEFAULT_APP_VERSION = 'dev';
const DEFAULT_MINIO_BUCKET = 'nimbo';
const DEFAULT_MINIO_REGION = 'us-east-1';

/**
 * Valor de desarrollo de `JWT_ACCESS_SECRET` que trae `.env.example` (plan 002 §6.10). Público a propósito: en
 * staging y en producción el esquema lo rechaza.
 */
export const LOCAL_JWT_ACCESS_SECRET = 'solo-desarrollo-local-nunca-usar-en-staging-ni-produccion';

/** Ambientes publicados: exigen https en los enlaces y TLS en el SMTP (001 CA-20). */
const PUBLISHED_ENVIRONMENTS: readonly string[] = ['staging', 'production'];
const URL_LIST_SEPARATOR = ',';

/** Los mensajes nunca incluyen el valor recibido (CA-18): todo esquema usa texto propio en español. */
const oneOf = <const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodEnum<z.Writeable<T>> =>
  z.enum(values, { errorMap: () => ({ message: `debe ser uno de: ${values.join(', ')}` }) });

const portNumber = (): z.ZodNumber =>
  z.coerce
    .number({ invalid_type_error: PORT_MESSAGE })
    .int(PORT_MESSAGE)
    .min(1, PORT_MESSAGE)
    .max(65535, PORT_MESSAGE);

const port = (defaultValue: number): z.ZodDefault<z.ZodNumber> =>
  portNumber().default(defaultValue);

/** Puerto sin valor por defecto: si falta, «es obligatoria» (no el motivo de formato). */
const requiredPort = () => z.string().pipe(portNumber());

const url = (): z.ZodString => z.string().url({ message: URL_MESSAGE });
const nonEmpty = (): z.ZodString => z.string().min(1, EMPTY_MESSAGE);

const isUrl = (value: string): boolean => url().safeParse(value).success;

/** `a,b` → `['a', 'b']`; todos los elementos deben ser URL. */
const urlList = () =>
  z
    .string()
    .transform((value) => value.split(URL_LIST_SEPARATOR).map((item) => item.trim()))
    .refine((items) => items.every(isUrl), { message: URL_LIST_MESSAGE });

/** Una variable vacía (`CLAVE=` en `.env.example`) cuenta como ausente. */
const optionalText = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const isPublished = (appEnv: string): boolean => PUBLISHED_ENVIRONMENTS.includes(appEnv);

/** Contrato común a todo proceso Nimbo (plan 000 §6.2): lo único de lo que depende `SharedModule`. */
const sharedEnvBaseSchema = z.object({
  NODE_ENV: oneOf(['development', 'test', 'production']),
  APP_ENV: oneOf(['local', 'test', 'staging', 'production']),
  APP_VERSION: nonEmpty().default(DEFAULT_APP_VERSION),
  LOG_LEVEL: oneOf(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  DATABASE_URL: url(),
  REDIS_URL: url(),
});

/** Lo que `SharedModule` y sus piezas internas necesitan; cada proceso provee un superconjunto. */
export type SharedEnvBase = z.infer<typeof sharedEnvBaseSchema>;

/** Ambos procesos comparten el mismo `.env` (CA-19), así que ambos validan el puerto interno de salud. */
const workerPortShape = { WORKER_PORT: port(DEFAULT_WORKER_PORT) };

/**
 * Forma del entorno del `worker`: el contrato común, su puerto de salud y el SMTP (001 plan §6.10); sin `MINIO_*`
 * ni `PORT`. `SMTP_PASSWORD` se declara **solo** aquí: el `api` no la necesita.
 */
export const workerEnvObjectSchema = sharedEnvBaseSchema.extend({
  ...workerPortShape,
  SMTP_HOST: nonEmpty(),
  SMTP_PORT: requiredPort(),
  SMTP_TLS: oneOf(['none', 'starttls', 'implicit']),
  SMTP_USER: optionalText(),
  SMTP_PASSWORD: optionalText(),
  MAIL_FROM: nonEmpty(),
});

/**
 * Forma del entorno del `api`: además el puerto HTTP público, MinIO, la URL pública de `web`, CORS y la clave que
 * firma los tokens de acceso (002), que se declara **solo** aquí.
 */
export const apiEnvObjectSchema = sharedEnvBaseSchema.extend({
  ...workerPortShape,
  PORT: port(DEFAULT_API_PORT),
  MINIO_ENDPOINT: url(),
  MINIO_ACCESS_KEY: nonEmpty(),
  MINIO_SECRET_KEY: nonEmpty(),
  MINIO_BUCKET: nonEmpty().default(DEFAULT_MINIO_BUCKET),
  MINIO_REGION: nonEmpty().default(DEFAULT_MINIO_REGION),
  WEB_PUBLIC_URL: url(),
  CORS_ORIGIN: urlList(),
  JWT_ACCESS_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH, JWT_SECRET_LENGTH_MESSAGE),
});

type DeclaredKey = keyof typeof apiEnvObjectSchema.shape | keyof typeof workerEnvObjectSchema.shape;

/**
 * Variables secretas. `satisfies` comprueba en tipos que **cada** una se declara en el esquema de algún proceso
 * (`api` o `worker`); `env.schema.spec.ts` lo repite en tiempo de ejecución (001 plan §6.10).
 */
export const SECRET_KEYS = SECRET_KEY_LIST satisfies readonly DeclaredKey[];

const addEnvIssue = (ctx: z.RefinementCtx, key: string, message: string): void => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
};

/** En staging y producción la clave de firma es larga y nunca la de `.env.example` (002 CA-26). */
const refinePublishedJwtSecret = (secret: string, ctx: z.RefinementCtx): void => {
  if (secret === LOCAL_JWT_ACCESS_SECRET) {
    addEnvIssue(ctx, 'JWT_ACCESS_SECRET', LOCAL_JWT_SECRET_MESSAGE);
  } else if (secret.length < PUBLISHED_JWT_SECRET_MIN_LENGTH) {
    addEnvIssue(ctx, 'JWT_ACCESS_SECRET', PUBLISHED_JWT_SECRET_LENGTH_MESSAGE);
  }
};

/**
 * Reglas entre variables del `api` en ambientes publicados: el enlace del correo nunca viaja por http (001 CA-20) y
 * la clave de firma no es la de desarrollo (002 CA-26).
 */
const refineApiEnv = (
  env: { APP_ENV: string; WEB_PUBLIC_URL: string; JWT_ACCESS_SECRET: string },
  ctx: z.RefinementCtx,
): void => {
  if (!isPublished(env.APP_ENV)) return;
  if (!env.WEB_PUBLIC_URL.startsWith('https://')) {
    addEnvIssue(ctx, 'WEB_PUBLIC_URL', HTTPS_MESSAGE);
  }
  refinePublishedJwtSecret(env.JWT_ACCESS_SECRET, ctx);
};

/** Reglas entre variables del `worker` (001 CA-18, CA-20). */
const refineWorkerEnv = (
  env: {
    APP_ENV: string;
    SMTP_TLS: string;
    SMTP_USER?: string | undefined;
    SMTP_PASSWORD?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void => {
  if (isPublished(env.APP_ENV) && env.SMTP_TLS === 'none') {
    addEnvIssue(ctx, 'SMTP_TLS', SMTP_TLS_MESSAGE);
  }
  if (env.SMTP_PASSWORD !== undefined && env.SMTP_USER === undefined) {
    addEnvIssue(ctx, 'SMTP_USER', SMTP_USER_MESSAGE);
  }
};

/** Entorno validado del `worker`. */
export const workerEnvSchema = workerEnvObjectSchema.superRefine(refineWorkerEnv);

/** Entorno validado del `api`. */
export const apiEnvSchema = apiEnvObjectSchema.superRefine(refineApiEnv);

export type Env = z.infer<typeof apiEnvSchema>;

/**
 * Entorno de las migraciones (003 plan §6.8, ADR-0005): la URL del rol dueño de las tablas. Lo leen solo
 * `data-source.cli.ts` y `scripts/migrate.ts`; no se une a `apiEnvSchema` ni a `workerEnvSchema`, y no cae a
 * `DATABASE_URL` (que es `nimbo_app`) si falta.
 */
export const migrationEnvSchema = z.object({
  DATABASE_MIGRATION_URL: url(),
});

export type MigrationEnv = z.infer<typeof migrationEnvSchema>;
