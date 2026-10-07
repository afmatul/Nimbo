import { FolderName } from './folder-name.vo';
import { NODE_NAME_MAX_LENGTH } from './node-name';

function reasonOf(raw: string): string | null {
  const result = FolderName.parse(raw);
  return result.ok ? null : result.reason;
}

describe('FolderName', () => {
  it('CA-2: normaliza a NFC y recorta los espacios de los extremos', () => {
    expect(FolderName.of('  año 2026  ').value).toBe('año 2026');
  });

  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['a/b', 'INVALID_NAME'],
    ['a\\b', 'INVALID_NAME'],
    ['a\u0000b', 'INVALID_NAME'],
    ['.', 'INVALID_NAME'],
    ['..', 'INVALID_NAME'],
    ['a'.repeat(NODE_NAME_MAX_LENGTH + 1), 'NAME_TOO_LONG'],
  ])('CA-2: «%s» se rechaza con %s', (raw, reason) => {
    expect(reasonOf(raw)).toBe(reason);
  });

  it('CA-2: acepta hasta 255 puntos de código', () => {
    expect(reasonOf('😀'.repeat(NODE_NAME_MAX_LENGTH))).toBeNull();
  });

  it('CA-2: `of` lanza con un nombre inválido', () => {
    expect(() => FolderName.of('a/b')).toThrow();
  });

  it('CA-3: `sameAs` compara sin distinguir mayúsculas («Ñ» y «ñ» colisionan)', () => {
    expect(FolderName.of('Ñandú').sameAs(FolderName.of('ñandú'))).toBe(true);
    expect(FolderName.of('Fotos').sameAs(FolderName.of('Videos'))).toBe(false);
  });

  describe('firstFree', () => {
    it('CA-14: si el nombre está libre lo conserva', () => {
      expect(FolderName.of('Fotos').firstFree(['Videos']).value).toBe('Fotos');
    });

    it('CA-14: un punto no marca extensión: «base (n)» va al final', () => {
      const taken = ['informe.2026', 'Informe.2026 (1)'];

      expect(FolderName.of('informe.2026').firstFree(taken).value).toBe('informe.2026 (2)');
    });

    it('CA-14: el nombre sugerido no pasa de 255 puntos de código', () => {
      const long = 'a'.repeat(NODE_NAME_MAX_LENGTH);

      const suggested = FolderName.of(long).firstFree([long]);

      expect(Array.from(suggested.value)).toHaveLength(NODE_NAME_MAX_LENGTH);
      expect(suggested.value.endsWith(' (1)')).toBe(true);
    });
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(FolderName.of('Fotos'))).toBe(true);
  });
});
