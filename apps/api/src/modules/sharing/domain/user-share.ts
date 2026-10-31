import { CannotShareWithSelfError, SharingInvalidLevelError } from './errors';

/**
 * Niveles que se asignan (RN-2): `OWNER` nace de la propiedad y no se asigna (DF-31). Los mismos de `@nimbo/contracts`
 * y del `CHECK` `ck_comparticion_nivel`, que el dominio no importa (ADR-0008); la prueba los ata.
 */
export const SHARE_LEVELS = ['VIEWER', 'EDITOR'] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export type ShareNodeType = 'file' | 'folder';

/** El nodo compartido: un archivo o una carpeta (S-1, ADR-0011). */
export interface SharedNodeRef {
  readonly type: ShareNodeType;
  readonly id: string;
}

export interface UserShareSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly node: SharedNodeRef;
  readonly level: ShareLevel;
  readonly createdAt: Date;
}

/** Datos para conceder; `level` llega sin validar contra la regla de DF-31. */
export interface GrantShareInput {
  readonly id: string;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly node: SharedNodeRef;
  readonly level: string;
  readonly now: Date;
}

const isShareLevel = (level: string): level is ShareLevel =>
  (SHARE_LEVELS as readonly string[]).includes(level);

const assignableLevel = (level: string): ShareLevel => {
  if (!isShareLevel(level)) throw new SharingInvalidLevelError();
  return level;
};

/** Acceso directo de un cliente a un nodo ajeno (`comparticion`, M3b). Uno por persona y nodo (RN-2). */
export class UserShare {
  private constructor(
    private readonly snapshot: Omit<UserShareSnapshot, 'level'>,
    private currentLevel: ShareLevel,
  ) {}

  /** CA-1, CA-2, CA-3: rechaza `OWNER` o un nivel desconocido y compartir con uno mismo. */
  static grant(input: GrantShareInput): UserShare {
    const level = assignableLevel(input.level);
    if (input.recipientId === input.ownerId) throw new CannotShareWithSelfError();
    const { id, ownerId, recipientId, node, now } = input;
    return new UserShare({ id, ownerId, recipientId, node, createdAt: now }, level);
  }

  static rehydrate(snapshot: UserShareSnapshot): UserShare {
    const { level, ...rest } = snapshot;
    return new UserShare(rest, level);
  }

  get id(): string {
    return this.snapshot.id;
  }

  get level(): ShareLevel {
    return this.currentLevel;
  }

  /** CA-5: cambia el nivel y dice si cambió; con el mismo nivel no hay cambio que auditar. */
  changeLevel(level: string): boolean {
    const next = assignableLevel(level);
    if (next === this.currentLevel) return false;
    this.currentLevel = next;
    return true;
  }

  toSnapshot(): UserShareSnapshot {
    return { ...this.snapshot, level: this.currentLevel };
  }
}
