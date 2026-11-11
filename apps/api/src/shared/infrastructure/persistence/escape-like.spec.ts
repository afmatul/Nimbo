import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it.each([
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['c:\\temp', 'c:\\\\temp'],
    ['%_\\', '\\%\\_\\\\'],
  ])('018 CA-4: «%s» queda como «%s», literal para `LIKE … ESCAPE`', (text, escaped) => {
    expect(escapeLike(text)).toBe(escaped);
  });

  it('018 CA-4: un texto sin comodines queda intacto', () => {
    expect(escapeLike('Informe del Camión.docx')).toBe('Informe del Camión.docx');
  });
});
