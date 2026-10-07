import { FolderPath } from './folder-path';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const pathOf = (...ids: string[]): FolderPath =>
  ids.reduce<FolderPath | null>((parent, id) => FolderPath.childOf(parent, id), null) as FolderPath;

describe('FolderPath', () => {
  it('CA-1: una carpeta en la raíz tiene ruta «/id/» y profundidad 1', () => {
    const path = FolderPath.childOf(null, A);

    expect(path.value).toBe(`/${A}/`);
    expect(path.depth).toBe(1);
    expect(path.folderId).toBe(A);
  });

  it('CA-1: una subcarpeta extiende la ruta del padre', () => {
    const path = pathOf(A, B);

    expect(path.value).toBe(`/${A}/${B}/`);
    expect(path.depth).toBe(2);
  });

  it('CA-5: `ancestorIds` da las migas desde la raíz, sin la carpeta misma', () => {
    expect(pathOf(A, B, C).ancestorIds()).toEqual([A, B]);
    expect(pathOf(A).ancestorIds()).toEqual([]);
  });

  it('`of` reconstruye la ruta leída de la BD y rechaza una mal formada', () => {
    expect(FolderPath.of(`/${A}/${B}/`).equals(pathOf(A, B))).toBe(true);
    expect(() => FolderPath.of(`${A}/`)).toThrow(TypeError);
    expect(() => FolderPath.of('/no-es-uuid/')).toThrow(TypeError);
    expect(() => FolderPath.of('/')).toThrow(TypeError);
  });

  describe('contains (CA-8)', () => {
    it('una carpeta se contiene a sí misma y a sus descendientes', () => {
      expect(pathOf(A).contains(pathOf(A))).toBe(true);
      expect(pathOf(A).contains(pathOf(A, B, C))).toBe(true);
    });

    it('no contiene a su padre ni a una hermana', () => {
      expect(pathOf(A, B).contains(pathOf(A))).toBe(false);
      expect(pathOf(A, B).contains(pathOf(A, C))).toBe(false);
    });
  });

  describe('subtreeDepthUnder (CA-9, CA-15)', () => {
    it('la hoja más profunda de B (en A/B/C) bajo D queda a 3 niveles', () => {
      const moved = pathOf(A, B);

      expect(moved.subtreeDepthUnder(pathOf(D), 3)).toBe(3);
    });

    it('a la raíz, el subárbol conserva solo su altura', () => {
      expect(pathOf(A, B).subtreeDepthUnder(null, 3)).toBe(2);
    });
  });

  describe('rebase (CA-7)', () => {
    it('mueve una descendiente bajo el destino conservando el tramo propio', () => {
      const descendant = pathOf(A, B, C);

      expect(descendant.rebase(pathOf(A, B), pathOf(D)).value).toBe(`/${D}/${B}/${C}/`);
    });

    it('a la raíz, la carpeta movida queda como «/id/…»', () => {
      expect(pathOf(A, B, C).rebase(pathOf(A, B), null).value).toBe(`/${B}/${C}/`);
    });

    it('lanza si la ruta no está dentro de la carpeta movida', () => {
      expect(() => pathOf(A, C).rebase(pathOf(A, B), null)).toThrow(TypeError);
    });
  });
});
