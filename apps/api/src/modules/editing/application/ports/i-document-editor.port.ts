/**
 * Servidor de documentos (ADR-0004; Art. V.2 a: aísla ONLYOFFICE). Desde 016 T-03: firmar la configuración del editor
 * y saber si está disponible; desde T-04, sacar a una cuenta de la sesión (CA-16); la verificación del aviso y la descarga
 * llegan con T-05.
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
}

export const I_DOCUMENT_EDITOR = Symbol('IDocumentEditor');
