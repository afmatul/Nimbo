/**
 * Trabajo de `editing-save` (plan 016 §4): la sesión, la cuenta propietaria firmada en el enlace del aviso y la URL de
 * descarga. Quien lo procesa relee la sesión con ese actor y no confía en nada más del trabajo. La URL nunca se
 * registra en una bitácora.
 */
export interface SaveVersionJob {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly url: string;
}

/**
 * Cola `editing-save` vista desde la aplicación (plan 016 §2, DF-20, RN-7): el aviso de estado 2 se procesa fuera de
 * la petición de ONLYOFFICE. Un trabajo por sesión (`jobId` = sesión): el mismo aviso dos veces no encola dos.
 */
export interface ISaveVersionQueue {
  enqueue(job: SaveVersionJob): Promise<void>;
}

export const I_SAVE_VERSION_QUEUE = Symbol('ISaveVersionQueue');
