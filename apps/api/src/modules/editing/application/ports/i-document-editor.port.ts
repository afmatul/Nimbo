/**
 * Servidor de documentos (ADR-0004; Art. V.2 a: aísla ONLYOFFICE). Desde 016 T-03: firmar la configuración del editor
 * y saber si está disponible; la verificación del aviso, la descarga y la expulsión llegan con T-04 y T-05.
 */
export interface IDocumentEditor {
  /** La configuración con su firma (`token`) para que el editor la acepte (JWT de ONLYOFFICE, HS256). */
  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
  /** `false` si no está configurado o no responde a tiempo (CA-15); nunca lanza. */
  isAvailable(): Promise<boolean>;
}

export const I_DOCUMENT_EDITOR = Symbol('IDocumentEditor');
