import { z, type ZodIssue } from 'zod';

const PORT_MESSAGE = 'debe ser un entero entre 1 y 65535';
const DEFAULT_PORT = 3002;

/**
 * Configuración de `web`, leída solo en el servidor en tiempo de petición (CA-29): sin `NEXT_PUBLIC_*`.
 * `scripts/check-env-example.ts` (T-23) compara estas claves con `.env.example` (CA-19).
 */
export const webEnvSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production'], {
    errorMap: () => ({ message: 'debe ser uno de: local, test, staging, production' }),
  }),
  API_INTERNAL_URL: z.string().url({ message: 'debe ser una URL válida' }),
  PORT: z.coerce
    .number({ invalid_type_error: PORT_MESSAGE })
    .int(PORT_MESSAGE)
    .min(1, PORT_MESSAGE)
    .max(65535, PORT_MESSAGE)
    .default(DEFAULT_PORT),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export type LoadWebEnvResult =
  | { readonly ok: true; readonly env: WebEnv }
  | { readonly ok: false; readonly issues: readonly string[] };

type EnvSource = Readonly<Record<string, string | undefined>>;

/** Formatea una issue nombrando la variable y el motivo, nunca el valor (CA-18). */
function formatIssue(issue: ZodIssue): string {
  const name = issue.path.join('.');
  const isMissing = issue.code === 'invalid_type' && issue.received === 'undefined';
  return isMissing ? `\`${name}\` es obligatoria` : `\`${name}\` ${issue.message}`;
}

/** Pura: no lee `process.env` salvo que se le pase, no escribe ni termina el proceso. */
export function loadWebEnv(source: EnvSource = process.env): LoadWebEnvResult {
  const parsed = webEnvSchema.safeParse(source);
  if (parsed.success) {
    return { ok: true, env: parsed.data };
  }
  return { ok: false, issues: parsed.error.issues.map(formatIssue) };
}

/** Para Server Components: `instrumentation.ts` ya abortó el arranque si la configuración era inválida. */
export function getEnv(): WebEnv {
  const result = loadWebEnv();
  if (!result.ok) {
    throw new Error(`Configuración inválida: ${result.issues.join('; ')}`);
  }
  return result.env;
}
