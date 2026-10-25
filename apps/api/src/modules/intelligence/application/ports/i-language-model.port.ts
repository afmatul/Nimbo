/**
 * Lo que recibe el modelo (020 D-5): la instrucción de sistema y el mensaje con la pregunta y los fragmentos numerados
 * 1..K como datos delimitados. Nunca lleva ids ni nombres de archivo (S-1).
 */
export interface LanguageModelPrompt {
  readonly system: string;
  readonly user: string;
}

/**
 * Genera la respuesta del agente en trozos de texto, en orden (diagrama M6, ADR-0007; reglas (a) y (c) de Art. V.2).
 * Si el proveedor falla, no tiene clave o vence un plazo (al primer trozo o entre trozos) lanza `AgentUnavailableError`,
 * antes o después de algún trozo (CA-15). Si quien llama cancela con `signal`, deja de entregar trozos y lanza
 * `signal.reason`. Nunca registra el prompt, la respuesta ni la clave.
 */
export interface ILanguageModel {
  stream(prompt: LanguageModelPrompt, signal: AbortSignal): AsyncIterable<string>;
}

export const I_LANGUAGE_MODEL = Symbol('ILanguageModel');
