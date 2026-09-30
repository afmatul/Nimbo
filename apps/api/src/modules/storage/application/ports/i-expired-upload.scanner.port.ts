/** Una carga activa vencida: solo identificadores, sin nombre, clave de objeto ni `upload_id` (ADR-0021). */
export interface ExpiredUpload {
  readonly id: string;
  readonly propietarioId: string;
}

/**
 * Barrido de cargas vencidas de **todos** los propietarios (plan §6 «Puertos», D-6, ADR-0021). Es el único acceso a
 * `carga` sin actor: llama a `carga_expiradas`, que no deja adelantar el reloj y tiene tope de 1000 filas. Se llama
 * dentro de `ITransactionRunner.run` (sin actor). Solo lo inyecta `UploadCleanupProcessor`: no se exporta desde
 * `storage/index.ts` y ningún servicio con `actor` lo recibe.
 */
export interface IExpiredUploadScanner {
  listExpiredIds(now: Date, limit: number): Promise<readonly ExpiredUpload[]>;
}

export const I_EXPIRED_UPLOAD_SCANNER = Symbol('IExpiredUploadScanner');
