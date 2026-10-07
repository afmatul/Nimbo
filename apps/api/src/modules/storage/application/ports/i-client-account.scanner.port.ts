/**
 * Ids de las cuentas de cliente, por páginas de `id` ascendente (spec 007 CA-13, plan D-12). Es el único acceso sin
 * actor de la conciliación: devuelve **solo** UUID, nunca cifras ni datos de la cuenta. Se llama dentro de
 * `ITransactionRunner.run` (sin actor). Solo lo inyecta `UsageReconcileProcessor`: no se exporta desde
 * `storage/index.ts` y ningún servicio con `actor` lo recibe.
 */
export interface IClientAccountScanner {
  /** Hasta `limit` ids mayores que `afterId` (o desde el primero, con `null`), en orden ascendente. */
  listClientIds(afterId: string | null, limit: number): Promise<readonly string[]>;
}

export const I_CLIENT_ACCOUNT_SCANNER = Symbol('IClientAccountScanner');
