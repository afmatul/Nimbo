import { AgentInvalidQuestionError } from './errors';

/**
 * Pregunta al agente ya validada (RN-7, CA-6): sin espacios en los extremos, no vacía y de a lo sumo `maxChars`
 * caracteres (unidades UTF-16, como `maxlength` del navegador). El texto nunca se guarda ni va a bitácoras (RN-10,
 * CA-18).
 */
export class AgentQuestion {
  private constructor(readonly text: string) {}

  /** Recorta y valida; el máximo llega de `AGENT_MAX_QUESTION_CHARS`, no de una constante del dominio. */
  static parse(raw: string, maxChars: number): AgentQuestion {
    const text = raw.trim();
    if (text.length === 0) throw new AgentInvalidQuestionError('empty', maxChars);
    if (text.length > maxChars) throw new AgentInvalidQuestionError('too_long', maxChars);
    return new AgentQuestion(text);
  }
}
