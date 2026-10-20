import type { Actor } from '../../../../shared';

/**
 * Puerto de frontera para el módulo dueño de un documento (plan 015 §2, Art. V.2; `editing` en 016): admite o retira
 * conexiones de la sala del documento. El canal no decide accesos (RN-2, ADR-0010): el dueño verifica el acceso del
 * `Actor` con `PermissionResolver`/`accessibleNodes(actor)` **antes** de llamar a `admit`.
 */
export interface IDocumentRooms {
  /**
   * Une la conexión `connectionId` a la sala del documento (CA-6). Lanza `ForbiddenError` (`SHARED_FORBIDDEN`) si la
   * conexión no existe o no es del `actor`: conocer el id de una conexión ajena no sirve (plan §5).
   */
  admit(actor: Actor, connectionId: string, documentId: string): Promise<void>;
  /** Saca de la sala del documento a todas las conexiones del usuario; dejan de recibir sus avisos (CA-8). */
  retire(userId: string, documentId: string): Promise<void>;
}

export const I_DOCUMENT_ROOMS = Symbol('IDocumentRooms');

/** Nombre del evento en proceso (ADR-0019) que avisa la salida de una conexión de la sala de un documento (CA-9). */
export const REALTIME_DOCUMENT_LEFT = 'realtime.document-left';

/**
 * Salida de una conexión de la sala de un documento: cierre limpio (pestaña, vencimiento del token) o caída detectada
 * por el latido en ≤ 60 s (RN-9). Lo escucha el dueño de la sala con `@OnEvent`, de forma idempotente (ADR-0019).
 */
export interface DocumentLeftEvent {
  readonly userId: string;
  readonly connectionId: string;
  readonly documentId: string;
}
