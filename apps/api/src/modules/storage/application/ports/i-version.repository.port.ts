import type { Actor } from '../../../../shared';
import type { FileVersion } from '../../domain/file-version';

/**
 * Versiones de un archivo (`version_archivo`, plan 014 §2). Cada método toma el `EntityManager` de
 * `TransactionContext.requireActorScope(actor)` (ADR-0005) y la RLS de `version_archivo` es la segunda barrera. Quien
 * llama resuelve antes el archivo con `INodeRepository.findAccessibleById` (CA-16) y, para escribir, toma
 * `IQuotaRepository.lockUsage(actor)` en la misma transacción.
 */
export interface IVersionRepository {
  /** Versiones del archivo, de la más reciente a la más antigua (`numero DESC`). */
  list(actor: Actor, fileId: string): Promise<readonly FileVersion[]>;
  /** La versión `versionId` **de** `fileId`; `null` si no existe, ya se podó o es de otro archivo (CA-11). */
  find(actor: Actor, fileId: string, versionId: string): Promise<FileVersion | null>;
  /** `MAX(numero) + 1` del archivo: bajo `lockUsage` es consecutivo y nunca reutiliza un número podado (RN-4). */
  nextNumber(actor: Actor, fileId: string): Promise<number>;
  insert(actor: Actor, version: FileVersion): Promise<void>;
  /**
   * Guarda la fecha de `version`, ya conservada por `FileVersion.conserveAsOriginal` (014b CA-1), solo si la fila no la
   * tenía: un reintento no alarga el plazo.
   */
  markKept(actor: Actor, version: FileVersion): Promise<void>;
  /** Borra la fila de `version`; `false` si ya no estaba (otra poda llegó antes). */
  delete(actor: Actor, version: FileVersion): Promise<boolean>;
}

export const I_VERSION_REPOSITORY = Symbol('IVersionRepository');
