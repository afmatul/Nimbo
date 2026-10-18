/**
 * Aviso del servidor al navegador: nombre del evento y su carga. Cada spec productora declara los suyos (RN-10) y su
 * carga nunca lleva contenido de archivos, URLs firmadas, tokens ni claves de enlaces (RN-5).
 */
export interface RealtimeNotice {
  readonly event: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Puerto de frontera para avisar por el canal en vivo (plan 015 §2, Art. V.2): lo usan los módulos productores sin
 * conocer Socket.IO. Entrega a cada conexión de la sala una vez, de mejor esfuerzo (RN-6). Síncrono y nunca lanza: un
 * aviso no hace fallar ni demora la operación de negocio que lo origina (RN-7, CA-12).
 */
export interface IRealtimePublisher {
  /** Avisa a todas las conexiones del usuario (CA-5). */
  toUser(userId: string, notice: RealtimeNotice): void;
  /** Avisa a las conexiones admitidas en la sala del documento (CA-6). */
  toDocument(documentId: string, notice: RealtimeNotice): void;
}

export const I_REALTIME_PUBLISHER = Symbol('IRealtimePublisher');
