/**
 * Perfil de un cliente para `sharing`: el destinatario que se busca por correo (RN-3: verificado y activo) o quien ya
 * tiene un acceso (CA-8).
 */
export interface Sharee {
  readonly id: string;
  readonly displayName: string;
  /** Normalizado (recortado y en minúsculas, D-16); solo viaja en la respuesta, nunca a bitácoras (CA-19). */
  readonly email: string;
}

/**
 * Destinatarios y nombres visibles para `sharing` (plan 012 §2, DF-84; Art. V.2 b: `sharing` no importa `identity`,
 * ADR-0010). Lo declara `sharing`, lo implementa `identity` (`ShareeDirectoryAdapter`) y se enlaza en la raíz
 * (`ShareeDirectoryBindingModule`), como `IUserDirectory` (DF-74). Sin `actor` (excepción de `architecture.md` §6
 * punto 9): lee solo `usuario` y nunca devuelve nodos.
 */
export interface IShareeDirectory {
  /**
   * CA-3, RN-8: el cliente con ese correo si está verificado y activo; `null` si no existe, es interno, no verificó su
   * correo o está suspendido, sin distinguir el motivo. Normaliza el correo como `identity`.
   */
  findClientByEmail(email: string): Promise<Sharee | null>;
  /**
   * CA-8: `id → perfil` (nombre visible y correo) de quienes ya tienen un acceso, sin filtrar estado (un suspendido
   * conserva su acceso, CA-17); un id sin cuenta no aparece en el mapa. Solo para la respuesta del propietario.
   */
  profiles(userIds: readonly string[]): Promise<ReadonlyMap<string, Sharee>>;
  /** CA-22: `id → nombre visible`; un id sin cuenta no aparece en el mapa. */
  displayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export const I_SHAREE_DIRECTORY = Symbol('IShareeDirectory');
