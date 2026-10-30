import type { Actor } from '../../../../shared';
import type { SharedNodeRef, ShareLevel, UserShare } from '../../domain/user-share';

/** Un acceso directo al nodo, con el id de quien lo recibe (su perfil lo da `IShareeDirectory`). */
export interface DirectGrant {
  readonly shareId: string;
  readonly granteeId: string;
  readonly level: ShareLevel;
  readonly createdAt: Date;
}

/** Un acceso que viene de una carpeta antepasada del nodo (RN-4): se revoca en esa carpeta. */
export interface InheritedGrant {
  readonly granteeId: string;
  readonly level: ShareLevel;
  readonly createdAt: Date;
  readonly folder: { readonly id: string; readonly name: string };
}

/** Un acceso directo vigente que el actor recibió (CA-22), con el id de quien lo comparte. */
export interface ReceivedGrant {
  readonly shareId: string;
  readonly node: SharedNodeRef;
  /** Nombre del nodo: viaja en la respuesta, nunca a bitácoras ni auditoría. */
  readonly name: string;
  readonly ownerId: string;
  readonly level: ShareLevel;
  readonly createdAt: Date;
}

/** Los accesos de un nodo del actor (CA-8): directos y heredados, en ese orden de lectura. */
export interface AccessGrants {
  readonly direct: readonly DirectGrant[];
  readonly inherited: readonly InheritedGrant[];
}

/**
 * Comparticiones del propietario (`comparticion`, plan 012 §2). Cada método corre dentro de `withActor(actor, …)`:
 * el adaptador usa `requireActorScope` y la RLS es la segunda barrera.
 */
export interface IShareRepository {
  /** El acceso directo de `recipientId` a un nodo del actor, o `null` (RN-2: a lo sumo uno por persona y nodo). */
  findDirect(actor: Actor, node: SharedNodeRef, recipientId: string): Promise<UserShare | null>;
  /** Guarda una compartición nueva; `false`, sin escribir, si no hay un nodo de ese tipo con ese id. */
  insert(actor: Actor, share: UserShare): Promise<boolean>;
  /** Persiste el nivel nuevo de un acceso directo del actor (CA-5). */
  updateLevel(actor: Actor, share: UserShare): Promise<void>;
  /**
   * CA-8: los accesos de un nodo propio y vivo (`ownedNodes`); `null` si no hay un nodo de ese tipo con ese id. Los
   * heredados salen de las carpetas de su `ruta` (del archivo, la de su carpeta), más cercanas al final.
   */
  listAccess(actor: Actor, node: SharedNodeRef): Promise<AccessGrants | null>;
  /**
   * CA-10, CA-11: borra el acceso directo `shareId` si el actor es su propietario (dentro de la consulta) y lo devuelve;
   * `null` si es ajeno, inexistente o ya revocado.
   */
  revoke(actor: Actor, shareId: string): Promise<UserShare | null>;
  /**
   * CA-22: los accesos directos del actor como destinatario cuyo nodo sigue en `nodos_compartidos()` (vivo y de un
   * propietario activo), más recientes primero; sin heredados.
   */
  listReceived(actor: Actor): Promise<ReceivedGrant[]>;
  /** El acceso directo `shareId` con el actor como destinatario (CA-23), o `null` si es ajeno o no existe. */
  findReceived(actor: Actor, shareId: string): Promise<UserShare | null>;
  /** Salir (CA-23): borra el acceso `shareId` solo si el actor es su destinatario; `null` si no había. */
  leave(actor: Actor, shareId: string): Promise<UserShare | null>;
}

export const I_SHARE_REPOSITORY = Symbol('IShareRepository');
