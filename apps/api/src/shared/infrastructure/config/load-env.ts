import type { z } from 'zod';

import { formatEnvIssues } from './env-report';

export type EnvSource = Readonly<Record<string, string | undefined>>;

export type LoadEnvResult<TEnv> =
  | { readonly ok: true; readonly env: TEnv }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Valida la configuración contra un esquema (CA-18). Pura: no escribe, no termina el proceso y solo
 * lee `process.env` si no se le pasa otra fuente; `main.ts` decide qué hacer con `ok: false`.
 */
export const loadEnv = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: EnvSource = process.env,
): LoadEnvResult<z.infer<TSchema>> => {
  const parsed = schema.safeParse(source);
  if (parsed.success) {
    return { ok: true, env: parsed.data as z.infer<TSchema> };
  }
  return { ok: false, issues: formatEnvIssues(parsed.error) };
};
