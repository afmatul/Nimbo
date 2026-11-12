/**
 * Traducción de las variables que inyecta Deploya (recursos de datos administrados) a las de Nimbo. Pura: recibe el
 * entorno y devuelve solo lo que hay que definir, más avisos sin valores. Nunca pisa una variable ya definida por el
 * usuario, salvo `DATABASE_URL` cuando conecta como el dueño de la base de Deploya: con ese rol la app no arranca
 * (`DatabaseRoleCheck`, ADR-0005), así que se reemplaza por `nimbo_app` con `NIMBO_APP_DB_PASSWORD`.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface DeployaEnvResult {
  readonly values: Readonly<Record<string, string>>;
  readonly warnings: readonly string[];
}

export const APP_ROLE = 'nimbo_app';
export const DEPLOYA_POSTGRES_URL = 'DEPLOYA_POSTGRES_URL';
const DEPLOYA_PREFIX = 'DEPLOYA_';

/** Destino de Nimbo ← fuentes en orden de preferencia (la sin prefijo puede haberla redefinido el usuario). */
const COPIES: readonly (readonly [string, readonly string[]])[] = [
  ['REDIS_URL', ['DEPLOYA_REDIS_URL']],
  ['MINIO_ENDPOINT', ['S3_ENDPOINT', 'DEPLOYA_S3_ENDPOINT']],
  ['MINIO_PUBLIC_ENDPOINT', ['S3_PUBLIC_ENDPOINT', 'DEPLOYA_S3_PUBLIC_ENDPOINT']],
  ['MINIO_ACCESS_KEY', ['S3_ACCESS_KEY', 'DEPLOYA_S3_ACCESS_KEY']],
  ['MINIO_SECRET_KEY', ['S3_SECRET_KEY', 'DEPLOYA_S3_SECRET_KEY']],
  ['MINIO_BUCKET', ['S3_BUCKET', 'DEPLOYA_S3_BUCKET']],
  ['MINIO_REGION', ['S3_REGION']],
];

const MISSING_APP_PASSWORD =
  'NIMBO_APP_DB_PASSWORD no está definida: DATABASE_URL queda con el dueño de la base y la app no arrancará';

/** Vacía cuenta como no definida, igual que `optionalText()` del esquema. */
const defined = (env: EnvSource, key: string): string | undefined => {
  const value = env[key];
  return value === undefined || value === '' ? undefined : value;
};

/** Solo actúa dentro de Deploya: staging y compose no llevan ninguna variable `DEPLOYA_*`. */
export const isDeploya = (env: EnvSource): boolean =>
  Object.keys(env).some((key) => key.startsWith(DEPLOYA_PREFIX) && defined(env, key) !== undefined);

/** La misma URL del dueño con el rol de aplicación; `URL` codifica la contraseña. */
export const appRoleUrl = (ownerUrl: string, password: string): string => {
  const url = new URL(ownerUrl);
  url.username = APP_ROLE;
  url.password = password;
  return url.toString();
};

/** `DATABASE_URL` que entra con el mismo usuario y al mismo servidor que la del dueño (la que inyecta Deploya). */
const connectsAsOwner = (databaseUrl: string, ownerUrl: string): boolean => {
  try {
    const current = new URL(databaseUrl);
    const owner = new URL(ownerUrl);
    return current.username === owner.username && current.host === owner.host;
  } catch {
    return false;
  }
};

const copyValues = (env: EnvSource): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const [target, sources] of COPIES) {
    if (defined(env, target) !== undefined) continue;
    const source = sources.map((key) => defined(env, key)).find((value) => value !== undefined);
    if (source !== undefined) values[target] = source;
  }
  return values;
};

const databaseValues = (env: EnvSource, ownerUrl: string): DeployaEnvResult => {
  const values: Record<string, string> = {};
  if (defined(env, 'DATABASE_MIGRATION_URL') === undefined)
    values['DATABASE_MIGRATION_URL'] = ownerUrl;
  const current = defined(env, 'DATABASE_URL');
  if (current !== undefined && !connectsAsOwner(current, ownerUrl)) return { values, warnings: [] };
  const password = defined(env, 'NIMBO_APP_DB_PASSWORD');
  if (password === undefined) return { values, warnings: [MISSING_APP_PASSWORD] };
  values['DATABASE_URL'] = appRoleUrl(ownerUrl, password);
  return { values, warnings: [] };
};

export const resolveDeployaEnv = (env: EnvSource): DeployaEnvResult => {
  if (!isDeploya(env)) return { values: {}, warnings: [] };
  const copies = copyValues(env);
  const ownerUrl = defined(env, DEPLOYA_POSTGRES_URL);
  if (ownerUrl === undefined) return { values: copies, warnings: [] };
  const database = databaseValues(env, ownerUrl);
  return { values: { ...copies, ...database.values }, warnings: database.warnings };
};

/**
 * Literal SQL con `standard_conforming_strings` (por omisión desde Postgres 9.1): la barra invertida es literal y la
 * comilla simple se duplica.
 */
export const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * Las mismas sentencias que `infra/postgres/init/10-nimbo-app.sh` (idempotentes): crea `nimbo_app` si falta y le fija
 * contraseña y atributos sin privilegios. `ALTER ROLE … PASSWORD` no admite parámetros: va como literal escapado.
 */
export const appRoleStatements = (password: string): readonly string[] => [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN CREATE ROLE ${APP_ROLE}; END IF;
   END $$`,
  `ALTER ROLE ${APP_ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT ` +
    `PASSWORD ${quoteLiteral(password)}`,
];

/** Comillas simples de `sh`: ninguna expansión; una comilla del valor se cierra, se escapa y se reabre. */
const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/** Líneas `export CLAVE='valor'` que el entrypoint evalúa con `eval`. */
export const toShellExports = (values: Readonly<Record<string, string>>): string =>
  Object.entries(values)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}\n`)
    .join('');
