import type { FieldIssueReason } from './error-codes';
import { evaluatePassword, type PasswordRuleResult } from './password-policy';

const EMAIL = 'ana.lopez@nimbo.me';

function failedReasons(results: readonly PasswordRuleResult[]): FieldIssueReason[] {
  return results.filter((result) => !result.passed).map((result) => result.reason);
}

function failuresOf(password: string, email = EMAIL): FieldIssueReason[] {
  return failedReasons(evaluatePassword(password, email));
}

describe('evaluatePassword (D-6)', () => {
  it.each(['Nimbo-Seguro-2026', 'Ñandú-Azul-2026'])(
    'CA-5: «%s» cumple todas las reglas',
    (password) => {
      expect(failuresOf(password)).toEqual([]);
    },
  );

  it('CA-22: devuelve cada regla con su `reason` y si se cumple', () => {
    expect(evaluatePassword('Nimbo-Seguro-2026', EMAIL)).toEqual([
      { rule: 'minLength', passed: true, reason: 'PASSWORD_TOO_SHORT' },
      { rule: 'maxLength', passed: true, reason: 'PASSWORD_TOO_LONG' },
      { rule: 'uppercase', passed: true, reason: 'PASSWORD_MISSING_UPPERCASE' },
      { rule: 'number', passed: true, reason: 'PASSWORD_MISSING_NUMBER' },
      { rule: 'symbol', passed: true, reason: 'PASSWORD_MISSING_SYMBOL' },
      { rule: 'notCommon', passed: true, reason: 'PASSWORD_COMMON' },
      { rule: 'notEmail', passed: true, reason: 'PASSWORD_EQUALS_EMAIL' },
    ]);
  });

  it('CA-5: 11 puntos de código es muy corta', () => {
    expect(failuresOf('Nimbo-Seg-1')).toEqual(['PASSWORD_TOO_SHORT']);
  });

  it('sin longitud máxima como requisito: 129 puntos de código es válida', () => {
    expect(failuresOf(`Aa1-${'x'.repeat(125)}`)).toEqual([]);
  });

  it('el tope técnico (1024 puntos de código) solo frena entradas enormes', () => {
    expect(failuresOf(`Aa1-${'x'.repeat(1020)}`)).toEqual([]);
    expect(failuresOf(`Aa1-${'x'.repeat(1021)}`)).toEqual(['PASSWORD_TOO_LONG']);
  });

  it('CA-5: sin mayúscula falla', () => {
    expect(failuresOf('nimbo-seguro-2026')).toEqual(['PASSWORD_MISSING_UPPERCASE']);
  });

  it('CA-5: sin número falla', () => {
    expect(failuresOf('Nimbo-Seguro-Azul')).toEqual(['PASSWORD_MISSING_NUMBER']);
  });

  it('CA-5: sin símbolo falla', () => {
    expect(failuresOf('NimboSeguro2026')).toEqual(['PASSWORD_MISSING_SYMBOL']);
  });

  it('CA-5: un espacio como único carácter especial no cuenta como símbolo', () => {
    expect(failuresOf('Nimbo Seguro 2026')).toEqual(['PASSWORD_MISSING_SYMBOL']);
  });

  it('CA-5: una contraseña común se rechaza sin distinguir mayúsculas', () => {
    expect(failuresOf('G00dPa$$w0rd')).toEqual(['PASSWORD_COMMON']);
  });

  it.each(['Password@123', 'Abcd!efg!123', 'Gaga_123_Gaga'])(
    'CA-5: «%s» cumple las demás reglas pero es común (top 1 000 000 de SecLists)',
    (password) => {
      expect(failuresOf(password)).toEqual(['PASSWORD_COMMON']);
    },
  );

  it('CA-5: igual al correo normalizado falla', () => {
    expect(failuresOf('Ana.Lopez-2026@nimbo.me', '  ANA.LOPEZ-2026@Nimbo.me ')).toEqual([
      'PASSWORD_EQUALS_EMAIL',
    ]);
  });

  it('CA-5: igual a la parte local del correo falla', () => {
    expect(failuresOf('Ana.Lopez-2026', 'ana.lopez-2026@nimbo.me')).toEqual([
      'PASSWORD_EQUALS_EMAIL',
    ]);
  });

  it('CA-5: cuenta puntos de código, no unidades UTF-16 (un emoji es 1)', () => {
    expect(failuresOf('Aa1-🙂🙂🙂🙂')).toEqual(['PASSWORD_TOO_SHORT']);
    expect(failuresOf('Aa1-🙂🙂🙂🙂🙂🙂🙂🙂')).toEqual([]);
  });

  it('CA-5: `Á` cuenta como mayúscula', () => {
    expect(failuresOf('Ágil-seguro-2026')).toEqual([]);
  });
});
