import type { ZodError, ZodIssue } from 'zod';

import type { FieldIssueResponse } from './error';

/** `reason` cuando el campo no llegó. */
export const REQUIRED_REASON = 'REQUIRED';
/** `reason` por defecto de un *issue* que no declara `params.reason`. */
export const INVALID_REASON = 'INVALID';
/** `reason` de una clave que el esquema estricto no declara (001 CA-7). */
export const UNKNOWN_FIELD_REASON = 'UNKNOWN_FIELD';

const PATH_SEPARATOR = '.';

function joinPath(path: readonly (string | number)[]): string {
  return path.join(PATH_SEPARATOR);
}

function isMissing(issue: ZodIssue): boolean {
  return issue.code === 'invalid_type' && issue.received === 'undefined';
}

function reasonOf(issue: ZodIssue): string {
  if (issue.code === 'custom' && typeof issue.params?.['reason'] === 'string') {
    return issue.params['reason'];
  }
  return isMissing(issue) ? REQUIRED_REASON : INVALID_REASON;
}

function toIssues(issue: ZodIssue): FieldIssueResponse[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      field: joinPath([...issue.path, key]),
      reason: UNKNOWN_FIELD_REASON,
      message: issue.message,
    }));
  }
  return [{ field: joinPath(issue.path), reason: reasonOf(issue), message: issue.message }];
}

/**
 * Convierte un `ZodError` en la lista `fields` del error HTTP (ADR-0020). Genérica: no conoce ningún módulo.
 * La usan el `ZodValidationPipe` de `shared` y los formularios de `web`.
 */
export function toFieldIssues(error: ZodError): FieldIssueResponse[] {
  return error.issues.flatMap(toIssues);
}
