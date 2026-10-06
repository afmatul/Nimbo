import { STORAGE_ERROR_CODES, createFolderSchema } from '@nimbo/contracts';

import {
  folderNameConflictMessage,
  folderNameFieldMessage,
  storageMessage,
} from '../../../lib/error-catalog';
import { StorageRequestError } from '../storage-request-error';

/**
 * Reglas y errores del nombre de una carpeta, compartidos por «Nueva carpeta», «Renombrar» y el alta en línea de
 * «Mover a…» (006 CA-2, CA-3, CA-9).
 */

export const NAME_FIELD = 'name';

/** Resultado de un intento: error del campo (`400`, `409`) o aviso del diálogo (`422`, red y demás). */
export interface NameFailure {
  readonly field?: string;
  readonly alert?: string;
}

function nameKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('es');
}

/** Nombre guardado de la carpeta que choca (sin distinguir mayúsculas); sin ella en la lista, el escrito sin espacios de sobra. */
export function storedNameOf(typed: string, siblings: readonly string[]): string {
  return siblings.find((sibling) => nameKey(sibling) === nameKey(typed)) ?? typed.trim();
}

/** Mismas reglas que la API (`contracts`): un nombre inválido no viaja (CA-2). */
export function validateFolderName(name: string): NameFailure | null {
  const parsed = createFolderSchema.safeParse({ name, parentId: null });
  if (parsed.success) return null;
  const issue = parsed.error.issues.find((candidate) => candidate.path[0] === NAME_FIELD);
  const reason: unknown = issue && 'params' in issue ? issue.params?.['reason'] : undefined;
  return { field: folderNameFieldMessage(typeof reason === 'string' ? reason : '') };
}

/** Error de crear o renombrar una carpeta; `networkFailure` cubre la red caída y lo que no tiene texto propio. */
export function folderNameFailureOf(
  error: unknown,
  typed: string,
  siblings: readonly string[],
  networkFailure: string,
): NameFailure {
  if (!(error instanceof StorageRequestError)) return { alert: networkFailure };
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
    return { field: folderNameConflictMessage(storedNameOf(typed, siblings)) };
  }
  const nameIssue = error.fields.find((issue) => issue.field === NAME_FIELD);
  if (nameIssue) return { field: folderNameFieldMessage(nameIssue.reason) };
  const known = storageMessage(error.code, error.details);
  return { alert: known ? `${known.cause} ${known.fix}` : networkFailure };
}
