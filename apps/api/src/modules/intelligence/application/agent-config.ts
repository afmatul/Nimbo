/** `AGENT_MAX_QUESTION_CHARS` (RN-7, P-6): lo valida la admisión y lo informa `GET /agent/status` (S-3). */
export interface AgentConfig {
  readonly maxQuestionChars: number;
}

export const AGENT_CONFIG = Symbol('AgentConfig');
