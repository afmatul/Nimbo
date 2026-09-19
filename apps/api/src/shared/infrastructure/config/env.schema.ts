import { z } from 'zod';

import type { SecretKey } from './secret-keys';

export { SECRET_KEYS } from './secret-keys';
export type { SecretKey } from './secret-keys';

const PORT_MESSAGE = 'debe ser un entero entre 1 y 65535';
const URL_MESSAGE = 'debe ser una URL válida';
const EMPTY_MESSAGE = 'no puede estar vacía';

const DEFAULT_API_PORT = 3000;
const DEFAULT_WORKER_PORT = 3001;
const DEFAULT_APP_VERSION = 'dev';
const DEFAULT_MINIO_BUCKET = 'nimbo';
const DEFAULT_MINIO_REGION = 'us-east-1';

/** Los mensajes nunca incluyen el valor recibido (CA-18): todo esquema usa texto propio en español. */
const oneOf = <const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodEnum<z.Writeable<T>> =>
  z.enum(values, { errorMap: () => ({ message: `debe ser uno de: ${values.join(', ')}` }) });

const port = (defaultValue: number): z.ZodDefault<z.ZodNumber> =>
  z.coerce
    .number({ invalid_type_error: PORT_MESSAGE })
    .int(PORT_MESSAGE)
    .min(1, PORT_MESSAGE)
    .max(65535, PORT_MESSAGE)
    .default(defaultValue);

const url = (): z.ZodString => z.string().url({ message: URL_MESSAGE });
const nonEmpty = (): z.ZodString => z.string().min(1, EMPTY_MESSAGE);

/** Variables comunes a `api` y `worker` (plan 000 §6.2). */
const processEnvSchema = z.object({
  NODE_ENV: oneOf(['development', 'test', 'production']),
  APP_ENV: oneOf(['local', 'test', 'staging', 'production']),
  APP_VERSION: nonEmpty().default(DEFAULT_APP_VERSION),
  WORKER_PORT: port(DEFAULT_WORKER_PORT),
  LOG_LEVEL: oneOf(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  DATABASE_URL: url(),
  REDIS_URL: url(),
});

/** `worker`: `SharedModule` (Postgres, Redis) y su puerto de salud; sin `MINIO_*` ni `PORT`. */
export const workerEnvSchema = processEnvSchema;

/** `api`: además el puerto HTTP público y el acceso a MinIO. `satisfies` garantiza que toda `SecretKey` esté en el esquema. */
export const apiEnvSchema = processEnvSchema.extend({
  PORT: port(DEFAULT_API_PORT),
  MINIO_ENDPOINT: url(),
  MINIO_ACCESS_KEY: nonEmpty(),
  MINIO_SECRET_KEY: nonEmpty(),
  MINIO_BUCKET: nonEmpty().default(DEFAULT_MINIO_BUCKET),
  MINIO_REGION: nonEmpty().default(DEFAULT_MINIO_REGION),
} satisfies Record<SecretKey, z.ZodTypeAny> & Record<string, z.ZodTypeAny>);

export type Env = z.infer<typeof apiEnvSchema>;
