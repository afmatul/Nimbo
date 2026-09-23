import type { Role } from './role.enum';

/**
 * Quién ejecuta una operación (CA-17). Todo servicio que toca datos de un usuario lo recibe como
 * primer parámetro. Se construye desde el JWT en 002; `RolesGuard` llega en 003.
 */
export interface Actor {
  readonly id: string;
  readonly role: Role;
  /** `false` para todo rol interno: ningún administrador, soporte u operador accede a contenido. */
  readonly canReadContent: boolean;
}
