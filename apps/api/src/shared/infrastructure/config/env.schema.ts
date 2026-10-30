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
const POSITIVE_INT_MESSAGE = 'debe ser un entero positivo';
const LOCAL_ONLYOFFICE_SECRET_MESSAGE = 'no puede ser el valor de desarrollo de .env.example';
const PUBLISHED_ONLYOFFICE_SECRET_LENGTH_MESSAGE =
  'debe tener al menos 32 caracteres en staging y en producción';
const MULTIPART_THRESHOLD_MESSAGE = 'debe ser mayor o igual que `UPLOAD_PART_SIZE_BYTES`';
const JWT_SECRET_MIN_LENGTH = 32;
/** 32 bytes aleatorios en base64url: el mínimo en ambientes publicados (plan 002 §6.10). */
const PUBLISHED_JWT_SECRET_MIN_LENGTH = 43;
const JWT_SECRET_LENGTH_MESSAGE = `debe tener al menos ${String(JWT_SECRET_MIN_LENGTH)} caracteres`;
const PUBLISHED_JWT_SECRET_LENGTH_MESSAGE = `debe tener al menos ${String(PUBLISHED_JWT_SECRET_MIN_LENGTH)} caracteres en staging y en producción`;
const LOCAL_JWT_SECRET_MESSAGE = 'no puede ser el valor de desarrollo de .env.example';

const DEFAULT_API_PORT = 3000;
const DEFAULT_WORKER_PORT = 3001;
/** Salud interna del proceso `worker-optimizer` (ADR-0038): otro puerto para que los dos convivan en el host en local. */
const DEFAULT_WORKER_OPTIMIZER_PORT = 3003;
const DEFAULT_APP_VERSION = 'dev';
const DEFAULT_MINIO_BUCKET = 'nimbo';
const DEFAULT_MINIO_REGION = 'us-east-1';
const DEFAULT_MINIO_PUBLIC_ENDPOINT = 'http://localhost:9000';

const MIB = 1024 * 1024;
/** Mínimo de S3 para toda parte salvo la última (005 plan §5). */
const MIN_UPLOAD_PART_SIZE_BYTES = 5 * MIB;
const DEFAULT_UPLOAD_PART_SIZE_BYTES = 8 * MIB;
const DEFAULT_UPLOAD_MULTIPART_THRESHOLD_BYTES = 16 * MIB;
const MIN_UPLOAD_URL_TTL_SECONDS = 60;
const MAX_UPLOAD_URL_TTL_SECONDS = 86_400;
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 3600;
const DEFAULT_RATE_LIMIT_UPLOAD_INIT_PER_MINUTE = 300;
const DEFAULT_RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE = 120;
/** Restaurar copia hasta el máximo por archivo en el servidor (014 plan §5): tasa propia, más baja que la descarga. */
const DEFAULT_RATE_LIMIT_VERSION_RESTORE_PER_MINUTE = 30;
const DEFAULT_UPLOAD_CLEANUP_INTERVAL_MINUTES = 10;
const DEFAULT_UPLOAD_CLEANUP_BATCH_SIZE = 100;
/** Tope de filas que devuelve `carga_expiradas` (005 plan §4): un lote mayor no tendría efecto. */
const MAX_UPLOAD_CLEANUP_BATCH_SIZE = 1000;
/** Profundidad máxima del árbol de carpetas (006 plan §7, decisión 2): configuración, no regla del plan. */
const MAX_FOLDER_MAX_DEPTH = 50;
const DEFAULT_FOLDER_MAX_DEPTH = 10;
const DEFAULT_TRASH_PURGE_INTERVAL_MINUTES = 60;
const DEFAULT_TRASH_PURGE_BATCH_SIZE = 100;
/** Tope de filas que devuelve `papelera_vencida` (006 plan §3): un lote mayor no tendría efecto. */
const MAX_TRASH_PURGE_BATCH_SIZE = 1000;
/** Accesos rápidos de la barra lateral (006 plan §9.2): fijados y recientes visibles por cuenta. */
const MAX_QUICK_ACCESS_ITEMS = 20;
const DEFAULT_QUICK_ACCESS_MAX_PINNED = 5;
const DEFAULT_QUICK_ACCESS_RECENT_VISIBLE = 3;
/** Un día: la conciliación corrige derivas raras, no es la fuente de verdad del contador (007 plan §4). */
const DEFAULT_USAGE_RECONCILE_INTERVAL_MINUTES = 1440;
const DEFAULT_USAGE_RECONCILE_BATCH_SIZE = 100;
/** Ids de cuenta por página de la conciliación, con el mismo tope que los otros barridos. */
const MAX_USAGE_RECONCILE_BATCH_SIZE = 1000;
/** Una hora: el evento en proceso casi nunca se pierde; la conciliación lo repone (009 plan §2, decisión 7). */
const DEFAULT_SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES = 60;
/** El mismo lote y tope que los otros barridos (009 plan §2, decisión 7). */
const DEFAULT_SUBSCRIPTION_RECONCILE_BATCH_SIZE = 100;
const MAX_SUBSCRIPTION_RECONCILE_BATCH_SIZE = 1000;
/** Cada minuto: el PDF que no se pudo emitir tras el cobro se repone pronto (009 plan §2, decisión 7). */
const DEFAULT_INVOICE_RETRY_INTERVAL_MINUTES = 1;
/** El mismo lote que los otros barridos; la función de facturas pendientes no devuelve más de 1000. */
const DEFAULT_INVOICE_RETRY_BATCH_SIZE = 100;
const MAX_INVOICE_RETRY_BATCH_SIZE = 1000;
/** Cada 15 minutos (010 plan §1): un vencimiento se procesa a más tardar un cuarto de hora después. */
const DEFAULT_SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES = 15;
/** El mismo lote y tope que los otros barridos (las funciones de la 010 no devuelven más de 1000). */
const DEFAULT_SUBSCRIPTION_RENEWAL_BATCH_SIZE = 100;
const MAX_SUBSCRIPTION_RENEWAL_BATCH_SIZE = 1000;
/** RN-8 de la 010: el aviso previo sale 3 días antes de `vence_en`, configurable de 1 a 7. */
const DEFAULT_RENEWAL_REMINDER_DAYS = 3;
const MAX_RENEWAL_REMINDER_DAYS = 7;
/** Intentos de abrir el canal en vivo por origen y minuto (015 CA-14): holgado para 25 usuarios (RNF-02). */
const DEFAULT_REALTIME_CONNECT_ATTEMPTS_PER_MINUTE = 60;
/** Tope editable inicial (016 RN-10): 50 MB, a validar en staging con ONLYOFFICE. */
const DEFAULT_EDITING_MAX_DOC_BYTES = 50 * 1024 * 1024;
/** Valor de ejemplo de `ONLYOFFICE_JWT_SECRET` en `.env.example`: en staging y producción se rechaza (016 plan §5). */
const EXAMPLE_ONLYOFFICE_JWT_SECRET = 'cambia-este-secreto-local';
const ONLYOFFICE_SECRET_MIN_LENGTH = 32;
/** Tope indexable inicial (019 RN-7, DF-37): 50 MiB, único y no por plan. */
const DEFAULT_INDEXING_MAX_FILE_BYTES = 50 * MIB;
/** Intentos de un trabajo de indexación antes de `fallido` (019 RN-6). */
const DEFAULT_INDEXING_MAX_ATTEMPTS = 3;
/** Un día: la conciliación repone eventos perdidos y archivos previos a 019 (RN-12), no es el disparo normal. */
const DEFAULT_INDEX_RECONCILE_INTERVAL_MINUTES = 1440;
/** El mismo lote y tope que los otros barridos. */
const DEFAULT_INDEX_RECONCILE_BATCH_SIZE = 100;
const MAX_INDEX_RECONCILE_BATCH_SIZE = 1000;
/** «Reintentar» por usuario y minuto (019 CA-13): es una acción manual y rara; el límite frena la repetición. */
const DEFAULT_RATE_LIMIT_INDEX_RETRY_PER_MINUTE = 10;
/** Modelo de embeddings por defecto (ADR-0007): se vectoriza a 768 dimensiones (ADR-0003). */
const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
/** Modelo que redacta las respuestas del agente (020 D-7, RNF-09). */
const DEFAULT_GEMINI_CHAT_MODEL = 'gemini-3.5-flash';
/** Largo máximo inicial de la pregunta al agente (020 RN-7, P-6). */
const DEFAULT_AGENT_MAX_QUESTION_CHARS = 1000;
/** Plazos iniciales del modelo hasta el primer trozo y entre trozos (020 D-7, CA-15); se miden en T-09. */
const DEFAULT_AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS = 5_000;
const DEFAULT_AGENT_MODEL_IDLE_TIMEOUT_MS = 5_000;
/** Ghostscript en Linux y macOS; en Windows se configura `gswin64c` (019 D-1). */
const DEFAULT_GHOSTSCRIPT_BIN = 'gs';
/** Tope de bytes optimizable (021 plan §6 B, medido en el spike de ADR-0037): 40 MB; por encima, `no_disponible`. */
const DEFAULT_OPTIMIZER_MAX_FILE_BYTES = 40_000_000;
/** Intentos de un trabajo de optimización: 1 + 2 reintentos (`architecture.md` §8). */
const DEFAULT_OPTIMIZER_MAX_ATTEMPTS = 3;
/** Tiempo límite de una operación de `sharp` (021 plan §6 B): unas 3 veces el peor caso medido (34,3 s). */
const DEFAULT_OPTIMIZER_TIMEOUT_MS = 100_000;
/** Cada cuánto la ficha vuelve a consultar una optimización en curso (021 plan §6 A, RN-10). */
const DEFAULT_OPTIMIZER_POLL_INTERVAL_MS = 3000;
/** Calcular y optimizar por cuenta y minuto (021 plan §6 A, RNF-07). */
const DEFAULT_RATE_LIMIT_OPTIMIZER_PER_MINUTE = 10;
/** Píxeles decodificados optimizables (021 plan §6 B, RN-8): 36 MP; por encima, `no_disponible(pixeles)`. */
const DEFAULT_OPTIMIZER_MAX_PIXELS = 36_000_000;
/** Ahorro mínimo en porcentaje (021 plan §6 A, RN-2); se exige junto con el mínimo en bytes. */
const DEFAULT_OPTIMIZER_MIN_SAVED_PERCENT = 20;
/** Ahorro mínimo en bytes (021 plan §6 A, RN-2): 1 MB. */
const DEFAULT_OPTIMIZER_MIN_SAVED_BYTES = 1_000_000;
/** Calidad JPEG con mozjpeg (021 plan §6 B, ADR-0037). */
const DEFAULT_OPTIMIZER_JPEG_QUALITY = 80;
const MAX_PERCENT = 100;

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

/** Entero dentro de `[min, max]` con mensaje propio (sin el valor recibido) y valor por defecto. */
const boundedInt = (
  min: number,
  max: number,
  message: string,
  defaultValue: number,
): z.ZodDefault<z.ZodNumber> =>
  z.coerce
    .number({ invalid_type_error: message })
    .int(message)
    .min(min, message)
    .max(max, message)
    .default(defaultValue);

const positiveInt = (defaultValue: number): z.ZodDefault<z.ZodNumber> =>
  boundedInt(1, Number.MAX_SAFE_INTEGER, POSITIVE_INT_MESSAGE, defaultValue);

const intBetween = (min: number, max: number, defaultValue: number): z.ZodDefault<z.ZodNumber> =>
  boundedInt(min, max, `debe ser un entero entre ${String(min)} y ${String(max)}`, defaultValue);

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

/** URL opcional: vacía cuenta como ausente. */
const optionalUrl = () =>
  z.preprocess((value) => (value === '' ? undefined : value), url().optional());

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

/** Puerto de salud del general; el `api` conserva su validación previa y el especializado tiene su propio puerto. */
const workerPortShape = { WORKER_PORT: port(DEFAULT_WORKER_PORT) };

/**
 * Puerto de salud del proceso `worker-optimizer` (ADR-0038), sin publicar nunca (CA-23). Solo lo lee su entrypoint;
 * el `api` no lo declara.
 */
const workerOptimizerPortShape = { WORKER_OPTIMIZER_PORT: port(DEFAULT_WORKER_OPTIMIZER_PORT) };

/**
 * MinIO, **una sola definición** que componen `api` y `worker` (005 plan §5): el `api` firma y valida cargas y el
 * `worker` aborta partes y borra objetos vencidos. Un secreto en ambos esquemas es válido porque es el mismo objeto.
 */
const minioShape = {
  MINIO_ENDPOINT: url(),
  MINIO_ACCESS_KEY: nonEmpty(),
  MINIO_SECRET_KEY: nonEmpty(),
  MINIO_BUCKET: nonEmpty().default(DEFAULT_MINIO_BUCKET),
  MINIO_REGION: nonEmpty().default(DEFAULT_MINIO_REGION),
};

/** Carga y descarga de archivos en el `api` (005 plan §5, RN-2, RN-16) y restauración de versiones (014 plan §5). */
const uploadApiShape = {
  /** Host contra el que se firman las URLs; distinto de `MINIO_ENDPOINT` (interno) y nunca un prefijo de ruta. */
  MINIO_PUBLIC_ENDPOINT: url().default(DEFAULT_MINIO_PUBLIC_ENDPOINT),
  UPLOAD_PART_SIZE_BYTES: boundedInt(
    MIN_UPLOAD_PART_SIZE_BYTES,
    Number.MAX_SAFE_INTEGER,
    `debe ser un entero de al menos ${String(MIN_UPLOAD_PART_SIZE_BYTES)} (5 MiB)`,
    DEFAULT_UPLOAD_PART_SIZE_BYTES,
  ),
  UPLOAD_MULTIPART_THRESHOLD_BYTES: positiveInt(DEFAULT_UPLOAD_MULTIPART_THRESHOLD_BYTES),
  UPLOAD_URL_TTL_SECONDS: intBetween(
    MIN_UPLOAD_URL_TTL_SECONDS,
    MAX_UPLOAD_URL_TTL_SECONDS,
    DEFAULT_UPLOAD_URL_TTL_SECONDS,
  ),
  RATE_LIMIT_UPLOAD_INIT_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_UPLOAD_INIT_PER_MINUTE),
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE),
  RATE_LIMIT_VERSION_RESTORE_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_VERSION_RESTORE_PER_MINUTE),
};

/** Barrido de cargas vencidas en el `worker` (005 plan §5). */
const uploadCleanupShape = {
  UPLOAD_CLEANUP_INTERVAL_MINUTES: positiveInt(DEFAULT_UPLOAD_CLEANUP_INTERVAL_MINUTES),
  UPLOAD_CLEANUP_BATCH_SIZE: intBetween(
    1,
    MAX_UPLOAD_CLEANUP_BATCH_SIZE,
    DEFAULT_UPLOAD_CLEANUP_BATCH_SIZE,
  ),
};

/** Carpetas en el `api` (006 plan §7, CA-9). */
const foldersApiShape = {
  FOLDER_MAX_DEPTH: intBetween(1, MAX_FOLDER_MAX_DEPTH, DEFAULT_FOLDER_MAX_DEPTH),
};

/** Accesos rápidos en el `api` (006 plan §9.2, CA-27, CA-28). */
const quickAccessApiShape = {
  QUICK_ACCESS_MAX_PINNED: intBetween(1, MAX_QUICK_ACCESS_ITEMS, DEFAULT_QUICK_ACCESS_MAX_PINNED),
  QUICK_ACCESS_RECENT_VISIBLE: intBetween(
    1,
    MAX_QUICK_ACCESS_ITEMS,
    DEFAULT_QUICK_ACCESS_RECENT_VISIBLE,
  ),
};

/** Canal en vivo en el `api` (015 plan §5, CA-14). Ruta y latido son constantes de `realtime`, no variables. */
const realtimeApiShape = {
  REALTIME_CONNECT_ATTEMPTS_PER_MINUTE: positiveInt(DEFAULT_REALTIME_CONNECT_ATTEMPTS_PER_MINUTE),
};

/**
 * Edición con ONLYOFFICE en el `api` (016 plan §5). Todas opcionales: sin ellas el editor responde
 * `EDITING_UNAVAILABLE` y el resto sigue (RNF-09).
 */
const editingApiShape = {
  ONLYOFFICE_JWT_SECRET: optionalText(),
  ONLYOFFICE_PUBLIC_URL: optionalUrl(),
  ONLYOFFICE_INTERNAL_URL: optionalUrl(),
  EDITING_CALLBACK_BASE_URL: optionalUrl(),
  EDITING_MAX_DOC_BYTES: positiveInt(DEFAULT_EDITING_MAX_DOC_BYTES),
};

/**
 * Intentos de un trabajo de indexación (019 RN-6), **una sola definición** para el `api` (que encola al recibir el
 * evento o el reintento) y el `worker` (que decide cuándo se agotaron).
 */
const indexingQueueShape = {
  INDEXING_MAX_ATTEMPTS: positiveInt(DEFAULT_INDEXING_MAX_ATTEMPTS),
};

/** «Reintentar» la indexación en el `api` (019 plan §4, CA-13). */
const indexingApiShape = {
  RATE_LIMIT_INDEX_RETRY_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_INDEX_RETRY_PER_MINUTE),
};

/**
 * Tiempo límite compartido por el `api` (caducidad) y `worker-optimizer` (sharp), con una sola definición.
 * Los intentos los fija únicamente el `api` al encolar; el consumidor consulta `job.opts.attempts`.
 */
const optimizerTimeoutShape = {
  OPTIMIZER_TIMEOUT_MS: positiveInt(DEFAULT_OPTIMIZER_TIMEOUT_MS),
};

/** Optimizador en el `api`: intentos al encolar, tope de bytes, intervalo de consulta y límite de tasa. */
const optimizerApiShape = {
  OPTIMIZER_MAX_ATTEMPTS: positiveInt(DEFAULT_OPTIMIZER_MAX_ATTEMPTS),
  OPTIMIZER_MAX_FILE_BYTES: positiveInt(DEFAULT_OPTIMIZER_MAX_FILE_BYTES),
  OPTIMIZER_POLL_INTERVAL_MS: positiveInt(DEFAULT_OPTIMIZER_POLL_INTERVAL_MS),
  RATE_LIMIT_OPTIMIZER_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_OPTIMIZER_PER_MINUTE),
};

/** `worker-optimizer` (021 plan §6): tope de píxeles (RN-8), umbral de ahorro (RN-2) y calidad JPEG. */
const optimizerWorkerShape = {
  OPTIMIZER_MAX_PIXELS: positiveInt(DEFAULT_OPTIMIZER_MAX_PIXELS),
  OPTIMIZER_MIN_SAVED_PERCENT: intBetween(1, MAX_PERCENT - 1, DEFAULT_OPTIMIZER_MIN_SAVED_PERCENT),
  OPTIMIZER_MIN_SAVED_BYTES: positiveInt(DEFAULT_OPTIMIZER_MIN_SAVED_BYTES),
  OPTIMIZER_JPEG_QUALITY: intBetween(1, MAX_PERCENT, DEFAULT_OPTIMIZER_JPEG_QUALITY),
};

/**
 * Proveedor Gemini, **una sola definición** para el `worker` (vectoriza los fragmentos, 019) y el `api` (vectoriza la
 * pregunta al agente en proceso, 020 D-8; enmienda RN-9 de la 019). `GEMINI_API_KEY` es opcional: sin ella la
 * indexación termina `fallido/proveedor_no_disponible`, el agente responde `AGENT_UNAVAILABLE` y el resto sigue
 * (RNF-09). Nunca llega al navegador.
 */
const geminiShape = {
  GEMINI_API_KEY: optionalText(),
  GEMINI_EMBEDDING_MODEL: nonEmpty().default(DEFAULT_GEMINI_EMBEDDING_MODEL),
};

/** Indexación en el `worker` (019 plan §5): tope indexable, conciliación y Ghostscript. */
const indexingWorkerShape = {
  INDEXING_MAX_FILE_BYTES: positiveInt(DEFAULT_INDEXING_MAX_FILE_BYTES),
  INDEX_RECONCILE_INTERVAL_MINUTES: positiveInt(DEFAULT_INDEX_RECONCILE_INTERVAL_MINUTES),
  INDEX_RECONCILE_BATCH_SIZE: intBetween(
    1,
    MAX_INDEX_RECONCILE_BATCH_SIZE,
    DEFAULT_INDEX_RECONCILE_BATCH_SIZE,
  ),
  GHOSTSCRIPT_BIN: nonEmpty().default(DEFAULT_GHOSTSCRIPT_BIN),
};

/** Agente con citas en el `api` (020 plan D-7, D-8): modelo, largo máximo de la pregunta (RN-7) y plazos (CA-15). */
const agentApiShape = {
  GEMINI_CHAT_MODEL: nonEmpty().default(DEFAULT_GEMINI_CHAT_MODEL),
  AGENT_MAX_QUESTION_CHARS: positiveInt(DEFAULT_AGENT_MAX_QUESTION_CHARS),
  AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS: positiveInt(DEFAULT_AGENT_MODEL_FIRST_CHUNK_TIMEOUT_MS),
  AGENT_MODEL_IDLE_TIMEOUT_MS: positiveInt(DEFAULT_AGENT_MODEL_IDLE_TIMEOUT_MS),
};

/** Purga programada de la papelera en el `worker` (006 plan §4, CA-19). */
const trashPurgeShape = {
  TRASH_PURGE_INTERVAL_MINUTES: positiveInt(DEFAULT_TRASH_PURGE_INTERVAL_MINUTES),
  TRASH_PURGE_BATCH_SIZE: intBetween(1, MAX_TRASH_PURGE_BATCH_SIZE, DEFAULT_TRASH_PURGE_BATCH_SIZE),
};

/** Conciliación programada de `espacio_usado` en el `worker` (007 plan §4, CA-13). */
const usageReconcileShape = {
  USAGE_RECONCILE_INTERVAL_MINUTES: positiveInt(DEFAULT_USAGE_RECONCILE_INTERVAL_MINUTES),
  USAGE_RECONCILE_BATCH_SIZE: intBetween(
    1,
    MAX_USAGE_RECONCILE_BATCH_SIZE,
    DEFAULT_USAGE_RECONCILE_BATCH_SIZE,
  ),
};

/** Conciliación programada de suscripciones en el `worker` (009 plan §2, CA-2). */
const subscriptionReconcileShape = {
  SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES: positiveInt(
    DEFAULT_SUBSCRIPTION_RECONCILE_INTERVAL_MINUTES,
  ),
  SUBSCRIPTION_RECONCILE_BATCH_SIZE: intBetween(
    1,
    MAX_SUBSCRIPTION_RECONCILE_BATCH_SIZE,
    DEFAULT_SUBSCRIPTION_RECONCILE_BATCH_SIZE,
  ),
};

/** Reintento programado de facturas sin PDF en el `worker` (009 plan §2, CA-6). */
const invoiceRetryShape = {
  INVOICE_RETRY_INTERVAL_MINUTES: positiveInt(DEFAULT_INVOICE_RETRY_INTERVAL_MINUTES),
  INVOICE_RETRY_BATCH_SIZE: intBetween(
    1,
    MAX_INVOICE_RETRY_BATCH_SIZE,
    DEFAULT_INVOICE_RETRY_BATCH_SIZE,
  ),
};

/** Pasada de renovación, vencimiento y aviso previo en el `worker` (010 plan §2, CA-1 a CA-5). */
const subscriptionRenewalShape = {
  SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES: positiveInt(DEFAULT_SUBSCRIPTION_RENEWAL_INTERVAL_MINUTES),
  SUBSCRIPTION_RENEWAL_BATCH_SIZE: intBetween(
    1,
    MAX_SUBSCRIPTION_RENEWAL_BATCH_SIZE,
    DEFAULT_SUBSCRIPTION_RENEWAL_BATCH_SIZE,
  ),
};

/**
 * Días del aviso previo a `vence_en` (010 RN-8): el `api` marca la suscripción «por vencer» y el `worker` envía el
 * correo, con el mismo valor.
 */
const renewalReminderShape = {
  RENEWAL_REMINDER_DAYS: intBetween(1, MAX_RENEWAL_REMINDER_DAYS, DEFAULT_RENEWAL_REMINDER_DAYS),
};

/**
 * Forma del entorno del `worker`: el contrato común, su puerto de salud, MinIO, el barrido de cargas (005), la purga
 * de la papelera (006), la conciliación de espacio (007), la de suscripciones y el reintento de facturas (009), la
 * indexación con Gemini (019) y el SMTP (001 plan §6.10); sin configuración del optimizador, `PORT` ni
 * `MINIO_PUBLIC_ENDPOINT`. `SMTP_PASSWORD` se declara **solo** aquí; `GEMINI_API_KEY` también la declara el `api`,
 * con la misma definición (020 D-8).
 */
export const workerEnvObjectSchema = sharedEnvBaseSchema.extend({
  ...workerPortShape,
  ...minioShape,
  ...uploadCleanupShape,
  ...trashPurgeShape,
  ...usageReconcileShape,
  ...subscriptionReconcileShape,
  ...invoiceRetryShape,
  ...subscriptionRenewalShape,
  ...renewalReminderShape,
  ...indexingQueueShape,
  ...indexingWorkerShape,
  ...geminiShape,
  SMTP_HOST: nonEmpty(),
  SMTP_PORT: requiredPort(),
  SMTP_TLS: oneOf(['none', 'starttls', 'implicit']),
  SMTP_USER: optionalText(),
  SMTP_PASSWORD: optionalText(),
  MAIL_FROM: nonEmpty(),
});

/**
 * Forma del entorno del `api`: además el puerto HTTP público, MinIO, la carga de archivos (005), las carpetas y los
 * accesos rápidos (006), el límite de intentos del canal en vivo (015), la edición (016), los intentos y el reintento
 * de la indexación (019), Gemini y el agente (020), el optimizador (021), la URL pública de `web`, CORS y la clave que
 * firma los tokens de acceso (002), que se declara **solo** aquí.
 */
export const apiEnvObjectSchema = sharedEnvBaseSchema.extend({
  ...workerPortShape,
  PORT: port(DEFAULT_API_PORT),
  ...minioShape,
  ...uploadApiShape,
  ...foldersApiShape,
  ...quickAccessApiShape,
  ...renewalReminderShape,
  ...realtimeApiShape,
  ...editingApiShape,
  ...indexingQueueShape,
  ...indexingApiShape,
  ...optimizerTimeoutShape,
  ...optimizerApiShape,
  ...geminiShape,
  ...agentApiShape,
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

/** En staging y producción la clave de ONLYOFFICE no es la de ejemplo y es larga (016 plan §5). */
const refinePublishedOnlyOfficeSecret = (
  secret: string | undefined,
  ctx: z.RefinementCtx,
): void => {
  if (secret === undefined) return;
  if (secret === EXAMPLE_ONLYOFFICE_JWT_SECRET) {
    addEnvIssue(ctx, 'ONLYOFFICE_JWT_SECRET', LOCAL_ONLYOFFICE_SECRET_MESSAGE);
  } else if (secret.length < ONLYOFFICE_SECRET_MIN_LENGTH) {
    addEnvIssue(ctx, 'ONLYOFFICE_JWT_SECRET', PUBLISHED_ONLYOFFICE_SECRET_LENGTH_MESSAGE);
  }
};

/**
 * Reglas entre variables del `api`: toda carga por partes tiene al menos dos partes (005 plan §5) y, en ambientes
 * publicados, el enlace del correo nunca viaja por http (001 CA-20) y la clave de firma no es la de desarrollo
 * (002 CA-26).
 */
const refineApiEnv = (
  env: {
    APP_ENV: string;
    WEB_PUBLIC_URL: string;
    JWT_ACCESS_SECRET: string;
    UPLOAD_PART_SIZE_BYTES: number;
    UPLOAD_MULTIPART_THRESHOLD_BYTES: number;
    ONLYOFFICE_JWT_SECRET?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void => {
  if (env.UPLOAD_MULTIPART_THRESHOLD_BYTES < env.UPLOAD_PART_SIZE_BYTES) {
    addEnvIssue(ctx, 'UPLOAD_MULTIPART_THRESHOLD_BYTES', MULTIPART_THRESHOLD_MESSAGE);
  }
  if (!isPublished(env.APP_ENV)) return;
  if (!env.WEB_PUBLIC_URL.startsWith('https://')) {
    addEnvIssue(ctx, 'WEB_PUBLIC_URL', HTTPS_MESSAGE);
  }
  refinePublishedJwtSecret(env.JWT_ACCESS_SECRET, ctx);
  refinePublishedOnlyOfficeSecret(env.ONLYOFFICE_JWT_SECRET, ctx);
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

/**
 * Entorno del proceso `worker-optimizer` (ADR-0038, PD-140): solo lo que su composición lee. La base común (registro,
 * base de datos, Redis), MinIO, el optimizador y su puerto de salud; sin SMTP, Gemini, indexación ni configuración de
 * mantenimiento de storage/billing. Sus variables ajenas no le impiden arrancar. Sin reglas entre variables.
 */
export const workerOptimizerEnvSchema = sharedEnvBaseSchema.extend({
  ...workerOptimizerPortShape,
  ...minioShape,
  ...optimizerTimeoutShape,
  ...optimizerWorkerShape,
});

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
