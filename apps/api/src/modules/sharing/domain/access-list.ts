import type { ShareLevel } from './user-share';

/** La persona con acceso; su correo y nombre solo viajan en la respuesta, nunca a bitácoras (CA-19). */
export interface Grantee {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

/** Acceso compartido en el propio nodo: se revoca con su `shareId` (CA-8, CA-10). */
export interface DirectAccess {
  readonly shareId: string;
  readonly grantee: Grantee;
  readonly level: ShareLevel;
  readonly createdAt: Date;
}

/** Acceso que viene de una carpeta que contiene al nodo: se revoca en esa carpeta, sin `shareId` (RN-4). */
export interface InheritedAccess {
  readonly grantee: Grantee;
  readonly level: ShareLevel;
  readonly createdAt: Date;
  readonly folder: { readonly id: string; readonly name: string };
}

export type AccessListEntry =
  | (DirectAccess & { readonly origin: 'direct' })
  | (InheritedAccess & { readonly origin: 'inherited' });

/** Quién tiene acceso a un nodo y de dónde le viene (CA-8, RF-18); value object de M3b. */
export class AccessList {
  private constructor(
    readonly direct: readonly DirectAccess[],
    readonly inherited: readonly InheritedAccess[],
  ) {}

  static of(groups: {
    readonly direct: readonly DirectAccess[];
    readonly inherited: readonly InheritedAccess[];
  }): AccessList {
    return new AccessList(Object.freeze([...groups.direct]), Object.freeze([...groups.inherited]));
  }

  /** Las entradas con su origen: primero las directas y luego las heredadas. */
  entries(): readonly AccessListEntry[] {
    return [
      ...this.direct.map((access) => ({ ...access, origin: 'direct' as const })),
      ...this.inherited.map((access) => ({ ...access, origin: 'inherited' as const })),
    ];
  }
}
