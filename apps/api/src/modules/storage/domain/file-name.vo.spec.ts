import { FILE_NAME_MAX_LENGTH, FileName } from './file-name.vo';

function reasonOf(raw: string): string | null {
  const result = FileName.parse(raw);
  return result.ok ? null : result.reason;
}

describe('FileName', () => {
  it('CA-7: recorta los espacios de los extremos', () => {
    expect(FileName.of('  informe.docx  ').value).toBe('informe.docx');
  });

  it('CA-6: normaliza a NFC (una «ñ» descompuesta es la misma que la compuesta)', () => {
    const decomposed = 'año.txt';

    expect(FileName.of(decomposed).value).toBe('año.txt');
  });

  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['a/b.txt', 'INVALID_NAME'],
    ['a\\b.txt', 'INVALID_NAME'],
    ['a\u0000b.txt', 'INVALID_NAME'],
    ['a\u001fb.txt', 'INVALID_NAME'],
    ['a\u007fb.txt', 'INVALID_NAME'],
    ['a\u0085b.txt', 'INVALID_NAME'],
    ['.', 'INVALID_NAME'],
    ['..', 'INVALID_NAME'],
    ['a'.repeat(FILE_NAME_MAX_LENGTH + 1), 'NAME_TOO_LONG'],
  ])('CA-7: «%s» se rechaza con %s', (raw, reason) => {
    expect(reasonOf(raw)).toBe(reason);
  });

  it('CA-7: acepta hasta 255 puntos de código aunque ocupen más unidades UTF-16', () => {
    expect(reasonOf('😀'.repeat(FILE_NAME_MAX_LENGTH))).toBeNull();
  });

  it('CA-7: `of` lanza con un nombre inválido', () => {
    expect(() => FileName.of('a/b')).toThrow();
  });

  it.each([
    ['Informe.DOCX', 'docx'],
    ['foto.final.JPG', 'jpg'],
    ['LEEME', ''],
    ['.bashrc', ''],
    ['nota.', ''],
  ])('CA-12: la extensión de «%s» es «%s» en minúsculas', (raw, extension) => {
    expect(FileName.of(raw).extension()).toBe(extension);
  });

  describe('firstFree', () => {
    it('CA-6: si el nombre está libre lo conserva', () => {
      expect(FileName.of('a.txt').firstFree(['b.txt']).value).toBe('a.txt');
    });

    it('CA-6: devuelve «base (1).ext» si el nombre está tomado', () => {
      expect(FileName.of('informe.docx').firstFree(['informe.docx']).value).toBe(
        'informe (1).docx',
      );
    });

    it('CA-6: usa el primer n ≥ 1 libre', () => {
      const taken = ['informe.docx', 'informe (1).docx', 'informe (3).docx'];

      expect(FileName.of('informe.docx').firstFree(taken).value).toBe('informe (2).docx');
    });

    it('CA-6: compara sin distinguir mayúsculas', () => {
      const taken = ['INFORME.DOCX', 'Informe (1).docx'];

      expect(FileName.of('informe.docx').firstFree(taken).value).toBe('informe (2).docx');
    });

    it('CA-6: «Ñ» y «ñ» colisionan', () => {
      expect(FileName.of('Ñandú.pdf').firstFree(['ñandú.pdf']).value).toBe('Ñandú (1).pdf');
    });

    it('CA-6: sin extensión devuelve «base (n)»', () => {
      expect(FileName.of('LEEME').firstFree(['leeme']).value).toBe('LEEME (1)');
    });

    it('CA-6: acepta los tomados como un iterable cualquiera', () => {
      expect(FileName.of('a.txt').firstFree(new Set(['a.txt'])).value).toBe('a (1).txt');
    });

    it('CA-7: el nombre sugerido no pasa de 255 puntos de código', () => {
      const long = `${'a'.repeat(FILE_NAME_MAX_LENGTH - 4)}.txt`;

      const suggested = FileName.of(long).firstFree([long]);

      expect(Array.from(suggested.value)).toHaveLength(FILE_NAME_MAX_LENGTH);
      expect(suggested.value.endsWith(' (1).txt')).toBe(true);
    });
  });

  it('CA-6: `sameAs` compara sin distinguir mayúsculas', () => {
    expect(FileName.of('A.txt').sameAs(FileName.of('a.TXT'))).toBe(true);
    expect(FileName.of('a.txt').sameAs(FileName.of('b.txt'))).toBe(false);
  });

  it('es inmutable', () => {
    const name = FileName.of('a.txt');

    expect(Object.isFrozen(name)).toBe(true);
  });
});
