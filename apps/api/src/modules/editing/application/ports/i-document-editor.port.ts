import type { Readable } from 'node:stream';

/**
 * Qué avisa el servidor de documentos sobre una sesión (plan 016 §4), sin su vocabulario: `editing` (alguien entró o
 * salió; estado 1 de ONLYOFFICE), `ready` (listo para guardar, 2), `failed` (error del editor, 3), `closed` (todos
 * salieron sin cambios, 4) e `ignored` (guardado forzado 6 y 7, u otros: no crean versión, RN-4).
 */
export type EditorSignalKind = 'editing' | 'ready' | 'failed' | 'closed' | 'ignored';

/** Aviso verificado: la clave del documento (la sesión), la señal, las cuentas conectadas y, al guardar, la URL. */
export interface EditorSignal {
  readonly documentKey: string;
  readonly kind: EditorSignalKind;
  readonly users: readonly string[];
  readonly downloadUrl: string | null;
}

/** Documento entregado por el editor: flujo y tamaño declarado (nunca se carga entero en memoria, plan §7). */
export interface DownloadedDocument {
  readonly content: Readable;
  readonly sizeBytes: bigint;
}

/** Por qué no se descarga lo entregado: no tiene sentido reintentar (CA-14, CA-19). */
export type DownloadRejection = 'untrusted_url' | 'redirect' | 'too_large' | 'no_length';

/** La descarga se rechazó sin bajar nada (o se cortó): un reintento daría lo mismo. */
export class EditorDownloadRejectedError extends Error {
  constructor(readonly reason: DownloadRejection) {
    super(`Descarga del editor rechazada: ${reason}.`);
    this.name = 'EditorDownloadRejectedError';
  }
}

/**
 * Servidor de documentos (ADR-0004; Art. V.2 a: aísla ONLYOFFICE). Firmar la configuración del editor y saber si está
 * disponible (T-03); sacar a una cuenta de la sesión (CA-16, T-04); verificar sus avisos y descargar lo guardado (T-05).
 */
export interface IDocumentEditor {
  /** La configuración con su firma (`token`) para que el editor la acepte (JWT de ONLYOFFICE, HS256). */
  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  /** `false` si no está configurado o no responde a tiempo (CA-15); nunca lanza. */
  isAvailable(): Promise<boolean>;
  /**
   * Desconecta a `userId` del documento abierto con la clave `documentKey` (la sesión): lo que escriba después ya no se
   * acepta (CA-16). `false` si el servidor de documentos no lo confirma; nunca lanza.
   */
  dropUser(documentKey: string, userId: string): Promise<boolean>;
  /** El aviso de un token firmado por el servidor de documentos (HS256 fijo); `null` si no vale (CA-19). */
  verifyCallback(token: string): EditorSignal | null;
  /**
   * Descarga lo guardado solo desde un origen del servidor de documentos, sin seguir redirecciones y hasta `maxBytes`
   * (CA-19). Lanza `EditorDownloadRejectedError` si lo rechaza; cualquier otro error es transitorio.
   */
  download(url: string, maxBytes: bigint): Promise<DownloadedDocument>;
}

export const I_DOCUMENT_EDITOR = Symbol('IDocumentEditor');
