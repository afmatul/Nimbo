import type { ZodError, ZodIssue } from 'zod';

const isMissing = (issue: ZodIssue): boolean =>
  issue.code === 'invalid_type' && issue.received === 'undefined';

/** Una issue nombra la variable y el motivo; nunca el valor recibido (CA-18). */
const formatEnvIssue = (issue: ZodIssue): string => {
  const name = issue.path.join('.');
  return isMissing(issue) ? `\`${name}\` es obligatoria` : `\`${name}\` ${issue.message}`;
};

/** Lista lista para `config.invalid` en stderr (main.ts) o para `pnpm env:check` (T-23). */
export const formatEnvIssues = (error: ZodError): string[] => error.issues.map(formatEnvIssue);
