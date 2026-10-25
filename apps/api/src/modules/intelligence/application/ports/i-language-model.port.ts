import type { AgentPrompt } from '../../domain/prompt-builder';

/**
 * Genera la respuesta del agente en trozos de texto, en orden (diagrama M6, ADR-0007; reglas (a) y (c) de Art. V.2).
 * Si el proveedor falla, no tiene clave o vence un plazo (al primer trozo o entre trozos) lanza `AgentUnavailableError`,
 * antes o después de algún trozo (CA-15). Si quien llama cancela con `signal`, deja de entregar trozos y lanza
 * `signal.reason`. Nunca registra el prompt, la respuesta ni la clave.
 */
export interface ILanguageModel {
  stream(prompt: AgentPrompt, signal: AbortSignal): AsyncIterable<string>;
}

export const I_LANGUAGE_MODEL = Symbol('ILanguageModel');
