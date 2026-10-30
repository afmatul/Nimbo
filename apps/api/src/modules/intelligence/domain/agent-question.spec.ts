import { AgentQuestion } from './agent-question';
import { AgentInvalidQuestionError } from './errors';

const MAX_CHARS = 1000;

const rejectionOf = (raw: string): AgentInvalidQuestionError => {
  try {
    AgentQuestion.parse(raw, MAX_CHARS);
  } catch (error) {
    if (error instanceof AgentInvalidQuestionError) return error;
    throw error;
  }
  throw new Error('La pregunta debió rechazarse');
};

describe('AgentQuestion (plan 020 §2, RN-7)', () => {
  it('CA-6: recorta los espacios de los extremos y conserva el texto', () => {
    expect(AgentQuestion.parse('  ¿Qué dice el contrato?\n', MAX_CHARS).text).toBe(
      '¿Qué dice el contrato?',
    );
  });

  it.each([
    ['vacía', ''],
    ['solo espacios', '   \n\t  '],
  ])('CA-6: una pregunta %s se rechaza con motivo `empty`', (_case, raw) => {
    expect(rejectionOf(raw).details).toEqual({ reason: 'empty' });
  });

  it('CA-6: una pregunta de exactamente el máximo se acepta', () => {
    expect(AgentQuestion.parse('a'.repeat(MAX_CHARS), MAX_CHARS).text).toHaveLength(MAX_CHARS);
  });

  it('CA-6: una pregunta de máximo + 1 se rechaza con motivo `too_long` y el mensaje dice el máximo', () => {
    const error = rejectionOf('a'.repeat(MAX_CHARS + 1));

    expect(error.details).toEqual({ reason: 'too_long' });
    expect(error.message).toContain('1000 caracteres');
  });

  it('CA-6: el máximo se mide después de recortar', () => {
    expect(AgentQuestion.parse(` ${'a'.repeat(MAX_CHARS)} `, MAX_CHARS).text).toHaveLength(
      MAX_CHARS,
    );
  });

  it('RN-7: el máximo es el que se recibe, no uno fijo', () => {
    expect(() => AgentQuestion.parse('abcd', 3)).toThrow(AgentInvalidQuestionError);
    expect(AgentQuestion.parse('abc', 3).text).toBe('abc');
  });
});
