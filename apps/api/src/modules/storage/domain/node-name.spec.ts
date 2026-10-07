import { NODE_NAME_MAX_LENGTH, firstFreeName, parseNodeName, withCopySuffix } from './node-name';

const identity = (value: string): string => value;

describe('reglas de nombre de nodo (archivo y carpeta)', () => {
  it('CA-2: `parseNodeName` normaliza a NFC, recorta y construye con el valor limpio', () => {
    expect(parseNodeName('  año  ', identity)).toEqual({ ok: true, name: 'año' });
  });

  it('CA-2: `parseNodeName` devuelve el motivo sin construir', () => {
    const create = jest.fn(identity);

    expect(parseNodeName('a/b', create)).toEqual({ ok: false, reason: 'INVALID_NAME' });
    expect(create).not.toHaveBeenCalled();
  });

  it('CA-3: `firstFreeName` compara sin distinguir mayúsculas ni forma Unicode', () => {
    const decomposed = 'Año';

    expect(firstFreeName('año', [decomposed], (n) => `año (${String(n)})`)).toBe('año (1)');
  });

  it('CA-3: `withCopySuffix` recorta la base para no pasar de 255 puntos de código', () => {
    const name = withCopySuffix(`${'a'.repeat(NODE_NAME_MAX_LENGTH)}`, '', 12);

    expect(Array.from(name)).toHaveLength(NODE_NAME_MAX_LENGTH);
    expect(name.endsWith(' (12)')).toBe(true);
  });
});
