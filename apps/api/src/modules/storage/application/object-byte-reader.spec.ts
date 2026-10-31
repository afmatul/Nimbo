import { objectByteReader } from './object-byte-reader';

describe('objectByteReader', () => {
  const objects = {
    getRange: jest.fn((_key: string, start: number, end: number) =>
      Promise.resolve(Buffer.alloc(end - start + 1, 1)),
    ),
  };

  beforeEach(() => objects.getRange.mockClear());

  it('expone el tamaño y lee el rango pedido con el extremo inclusivo', async () => {
    const reader = objectByteReader(objects, 'clave', 10n);

    expect(reader.size).toBe(10);
    await expect(reader.read(2, 4)).resolves.toHaveLength(4);
    expect(objects.getRange).toHaveBeenCalledWith('clave', 2, 5);
  });

  it('recorta al final del objeto y no lee más allá', async () => {
    const reader = objectByteReader(objects, 'clave', 10n);

    await reader.read(8, 100);
    expect(objects.getRange).toHaveBeenCalledWith('clave', 8, 9);
    await expect(reader.read(10, 5)).resolves.toHaveLength(0);
    expect(objects.getRange).toHaveBeenCalledTimes(1);
  });
});
