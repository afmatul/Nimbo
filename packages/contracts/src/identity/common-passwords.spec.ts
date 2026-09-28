import { statSync } from 'node:fs';
import { join } from 'node:path';

import { COMMON_PASSWORDS } from './common-passwords';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './parameters';

const MAX_FILE_BYTES = 50 * 1024;
/** Piso de entradas: el top 1 000 000 filtrado deja ~1600; menos indica una fuente equivocada (review 001 I-1). */
const MIN_ENTRIES = 1000;
/** Entrada del top 1 000 000 de SecLists que cumple el filtro de plan §6.2 (fijada al generar la lista). */
const KNOWN_ENTRY = 'g00dpa$$w0rd';

describe('COMMON_PASSWORDS', () => {
  it('CA-5: el archivo generado pesa menos de 50 KB (se envía al navegador, CA-22)', () => {
    const { size } = statSync(join(__dirname, 'common-passwords.ts'));

    expect(size).toBeLessThan(MAX_FILE_BYTES);
  });

  it('CA-5: toda entrada está en minúsculas, mide 12 a 128 puntos de código y tiene número y símbolo', () => {
    for (const entry of COMMON_PASSWORDS) {
      const length = Array.from(entry).length;

      expect(entry).toBe(entry.toLowerCase());
      expect(length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
      expect(length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH);
      expect(entry).toMatch(/\p{Nd}/u);
      expect(entry).toMatch(/[^\p{L}\p{N}\s]/u);
    }
  });

  it('CA-5: tiene al menos 1000 entradas (la regla «común» rechaza algo real)', () => {
    expect(COMMON_PASSWORDS.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
  });

  it('CA-5: no tiene duplicados', () => {
    expect(new Set(COMMON_PASSWORDS).size).toBe(COMMON_PASSWORDS.length);
  });

  it('CA-5: contiene una entrada conocida del top de SecLists', () => {
    expect(COMMON_PASSWORDS).toContain(KNOWN_ENTRY);
  });
});
