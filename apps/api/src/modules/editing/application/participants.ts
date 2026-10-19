/** Participante tal como lo ven los demás: el nombre lo pone el servidor desde la cuenta (RN-12). */
export interface Participant {
  readonly userId: string;
  readonly displayName: string;
}

/** Si una cuenta ya no tiene nombre (borrada a mitad de sesión), se muestra igual sin inventar uno ajeno (RN-12). */
const UNNAMED_PARTICIPANT = 'Persona sin nombre';

export const nameOf = (names: ReadonlyMap<string, string>, userId: string): string =>
  names.get(userId) ?? UNNAMED_PARTICIPANT;

/** Los participantes conectados, en orden de entrada, con su nombre de `IUserDirectory`. */
export const toParticipants = (
  userIds: readonly string[],
  names: ReadonlyMap<string, string>,
): Participant[] => userIds.map((userId) => ({ userId, displayName: nameOf(names, userId) }));
