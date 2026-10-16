import type { Actor } from '../../../../shared';
import type { EditSession } from '../../domain/edit-session';

/**
 * Sesiones de edición y participantes (`sesion_edicion`, `participacion`; plan 016 §2, DF-19: no es el
 * `ISessionRepository` de `identity`). Todo método toma el `EntityManager` de `requireActorScope(actor)`: la RLS de
 * las dos tablas es la segunda barrera (solo la cuenta propietaria, hasta 012). Los que escriben exigen la
 * transacción `withActor` del llamador.
 */
export interface IEditSessionRepository {
  /** La sesión abierta (`activa` o `guardando`) del archivo, bloqueada (`FOR UPDATE`) hasta el fin de la transacción. */
  findOpenForUpdate(actor: Actor, fileId: string): Promise<EditSession | null>;
  /** La sesión `sessionId` si sigue abierta (`activa` o `guardando`); `null` en otro caso. */
  findOpen(actor: Actor, sessionId: string): Promise<EditSession | null>;
  /**
   * Inserta la sesión `activa` si el archivo no tiene otra abierta; `false` si otra apertura llegó antes
   * (`uq_sesion_edicion_abierta`), sin abortar la transacción.
   */
  insertIfNoneOpen(actor: Actor, session: EditSession): Promise<boolean>;
  /** Cuentas conectadas como editoras a la sesión (`salio_en IS NULL`), por orden de entrada. */
  activeParticipants(actor: Actor, sessionId: string): Promise<readonly string[]>;
  /** Alta de `userId` como participante conectado; si ya participó, vuelve a contar como conectado. */
  join(
    actor: Actor,
    participation: { sessionId: string; userId: string; now: Date },
  ): Promise<void>;
}

export const I_EDIT_SESSION_REPOSITORY = Symbol('IEditSessionRepository');
