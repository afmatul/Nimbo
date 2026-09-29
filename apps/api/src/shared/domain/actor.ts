import { Role } from './role.enum';

/**
 * Quién ejecuta una operación (CA-17). Todo servicio que toca datos de un usuario lo recibe como
 * primer parámetro. Solo se construye con `createActor`, desde los *claims* del token (003 D-9).
 */
export interface Actor {
  readonly id: string;
  readonly role: Role;
  /** `false` para todo rol interno: ningún administrador, soporte u operador accede a contenido. */
  readonly canReadContent: boolean;
}

/** Único lugar que decide `canReadContent`: solo `CLIENT` lee contenido (Art. IX.1, 003 CA-9). */
export const createActor = (id: string, role: Role): Actor =>
  Object.freeze({ id, role, canReadContent: role === Role.CLIENT });
