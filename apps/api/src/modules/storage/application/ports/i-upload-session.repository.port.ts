import type { Actor } from '../../../../shared';
import type {
  UploadRejectionReason,
  UploadSession,
  UploadState,
} from '../../domain/upload-session';

/** Lo que cambia con la transición, además de `estado`: la marca de tiempo y, solo si pasa a `rechazada`, el motivo. */
export interface UploadTransitionPatch {
  readonly at: Date;
  readonly rejectionReason: UploadRejectionReason | null;
}

/**
 * Sesiones de carga (`carga`) del actor (plan §6 «Puertos»). Cada método toma el `EntityManager` de
 * `TransactionContext.requireActorScope(actor)`; la RLS hace que una carga ajena no exista. Las cargas vencidas de
 * todos los propietarios **no** se leen por aquí: eso es `IExpiredUploadScanner`, el único acceso sin actor.
 */
export interface IUploadSessionRepository {
  /** Inserta la fila; mientras esté `activa` y sin vencer, es la reserva de cuota (D-5). */
  insert(actor: Actor, session: UploadSession): Promise<void>;
  /** La carga `id` si es del actor; `null` si no existe o es ajena (CA-16). */
  findOwned(actor: Actor, id: string): Promise<UploadSession | null>;
  /**
   * Compare-and-set: `UPDATE carga SET estado = to … WHERE id = $id AND estado = from`. Devuelve `false` (0 filas)
   * si la carga ya no está en `from`: otra petición ganó la carrera (Art. XI).
   */
  transition(
    actor: Actor,
    id: string,
    from: UploadState,
    to: UploadState,
    patch: UploadTransitionPatch,
  ): Promise<boolean>;
}

export const I_UPLOAD_SESSION_REPOSITORY = Symbol('IUploadSessionRepository');
