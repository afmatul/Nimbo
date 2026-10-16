/**
 * Nombres visibles de cuentas (plan 016 §2, DF-74; Art. V.2 d: `editing` no importa `identity`). Lo declara `editing`,
 * lo implementa `identity` (`UserDirectoryAdapter`) y se enlaza en la raíz (`UserDirectoryBindingModule`). Sin `actor`
 * (excepción de `architecture.md` §6 punto 9): solo recibe ids de participantes que `editing` ya autorizó y devuelve
 * el nombre, nunca otro dato de la cuenta ni nodos (RN-12).
 */
export interface IUserDirectory {
  /** `id → nombre visible`; un id sin cuenta no aparece en el mapa. */
  displayNames(userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export const I_USER_DIRECTORY = Symbol('IUserDirectory');
