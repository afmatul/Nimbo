/** Estados de `sesion_edicion.estado` (`CHECK` de la migración). */
export const EDIT_SESSION_STATES = [
  'activa',
  'guardando',
  'cerrada',
  'sin_cambios',
  'fallida',
] as const;
export type EditSessionState = (typeof EDIT_SESSION_STATES)[number];

/** Motivos de `sesion_edicion.motivo_fallo` (CA-14): `editor` es el estado 3 de ONLYOFFICE. */
export const EDIT_SESSION_FAILURES = [
  'integridad',
  'editor',
  'archivo_purgado',
  'almacenamiento',
] as const;
export type EditSessionFailure = (typeof EDIT_SESSION_FAILURES)[number];

export interface OpenEditSessionInput {
  readonly id: string;
  readonly fileId: string;
  readonly ownerId: string;
  readonly openedBy: string;
  /** Versión vigente al abrir. */
  readonly baseVersionId: string;
  readonly now: Date;
}

export interface EditSessionSnapshot extends Omit<OpenEditSessionInput, 'now'> {
  readonly state: EditSessionState;
  readonly failureReason: EditSessionFailure | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

/** Desde qué estados se llega a cada uno; `cerrada`, `sin_cambios` y `fallida` son finales. */
const ALLOWED_FROM: Readonly<Record<EditSessionState, readonly EditSessionState[]>> = {
  activa: [],
  guardando: ['activa'],
  cerrada: ['guardando'],
  sin_cambios: ['activa'],
  fallida: ['activa', 'guardando'],
};

/** Mismas reglas que el `CHECK` de la tabla: hay motivo si y solo si la sesión falló. */
function assertInvariants(snapshot: EditSessionSnapshot): void {
  if ((snapshot.state === 'fallida') !== (snapshot.failureReason !== null)) {
    throw new TypeError('Una sesión de edición tiene motivo de fallo solo si está `fallida`.');
  }
}

const copyDate = (date: Date | null): Date | null => (date === null ? null : new Date(date));

/**
 * Sesión de edición de un archivo (M5, `sesion_edicion`), inmutable: cada transición devuelve otra. Solo el estado 2
 * de ONLYOFFICE la lleva a `guardando` y de ahí a una versión (RN-4, DF-39: 1:0..1); el cierre sin cambios (4) y el
 * error del editor (3) la terminan sin versión. Una transición inválida es un error de programación: el repositorio
 * hace la misma comprobación en la BD (CAS) para las carreras.
 */
export class EditSession {
  private readonly data: EditSessionSnapshot;

  private constructor(snapshot: EditSessionSnapshot) {
    assertInvariants(snapshot);
    this.data = Object.freeze({
      ...snapshot,
      startedAt: new Date(snapshot.startedAt),
      endedAt: copyDate(snapshot.endedAt),
    });
    Object.freeze(this);
  }

  static open(input: OpenEditSessionInput): EditSession {
    const { now, ...rest } = input;
    return new EditSession({
      ...rest,
      state: 'activa',
      failureReason: null,
      startedAt: now,
      endedAt: null,
    });
  }

  static rehydrate(snapshot: EditSessionSnapshot): EditSession {
    return new EditSession(snapshot);
  }

  /** Estado 2: el documento está listo para guardar. */
  startSaving(): EditSession {
    return this.moveTo('guardando', null);
  }

  /** La versión quedó registrada (CA-9). */
  close(now: Date): EditSession {
    return this.moveTo('cerrada', now);
  }

  /** Estado 4: todos salieron sin cambios (CA-11). */
  closeWithoutChanges(now: Date): EditSession {
    return this.moveTo('sin_cambios', now);
  }

  /** La versión vigente no cambia (CA-14). */
  fail(reason: EditSessionFailure, now: Date): EditSession {
    return this.moveTo('fallida', now, reason);
  }

  get id(): string {
    return this.data.id;
  }

  get fileId(): string {
    return this.data.fileId;
  }

  get ownerId(): string {
    return this.data.ownerId;
  }

  get openedBy(): string {
    return this.data.openedBy;
  }

  get baseVersionId(): string {
    return this.data.baseVersionId;
  }

  get state(): EditSessionState {
    return this.data.state;
  }

  get failureReason(): EditSessionFailure | null {
    return this.data.failureReason;
  }

  get startedAt(): Date {
    return new Date(this.data.startedAt);
  }

  get endedAt(): Date | null {
    return copyDate(this.data.endedAt);
  }

  snapshot(): EditSessionSnapshot {
    return { ...this.data, startedAt: this.startedAt, endedAt: this.endedAt };
  }

  private moveTo(
    state: EditSessionState,
    endedAt: Date | null,
    failureReason: EditSessionFailure | null = null,
  ): EditSession {
    if (!ALLOWED_FROM[state].includes(this.data.state)) {
      throw new TypeError(`Una sesión \`${this.data.state}\` no puede pasar a \`${state}\`.`);
    }
    return new EditSession({ ...this.data, state, endedAt, failureReason });
  }
}
