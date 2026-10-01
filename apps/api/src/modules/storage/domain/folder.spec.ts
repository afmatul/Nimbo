import { FolderDepthExceededError, InvalidMoveError } from './errors';
import { Folder, type CreateFolderInput } from './folder';
import { FolderName } from './folder-name.vo';
import { TrashState } from './trash-state';

const OWNER = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-09-30T10:00:00.000Z');
const MAX_DEPTH = 3;

function create(overrides: Partial<CreateFolderInput> = {}): Folder {
  return Folder.create({
    id: A,
    ownerId: OWNER,
    name: FolderName.of('Fotos'),
    parent: null,
    maxDepth: MAX_DEPTH,
    now: NOW,
    ...overrides,
  });
}

/** Cadena A ⊃ B ⊃ C, cada una dentro de la anterior. */
function chain(): [Folder, Folder, Folder] {
  const a = create();
  const b = create({ id: B, parent: a });
  const c = create({ id: C, parent: b });
  return [a, b, c];
}

describe('Folder', () => {
  it('CA-1: se crea vacía en la raíz, viva y con ruta propia', () => {
    const folder = create();

    expect(folder.type).toBe('folder');
    expect(folder.parentId).toBeNull();
    expect(folder.path.value).toBe(`/${A}/`);
    expect(folder.depth).toBe(1);
    expect(folder.trash).toBeNull();
    expect(folder.createdAt).toEqual(NOW);
  });

  it('CA-1: dentro de otra carpeta toma su ruta', () => {
    const [a, b] = chain();

    expect(b.parentId).toBe(a.id);
    expect(b.path.value).toBe(`/${A}/${B}/`);
  });

  it('CA-9: no se crea dentro de una carpeta que ya está en la profundidad máxima', () => {
    const [, , c] = chain();

    expect(() => create({ id: OWNER, parent: c })).toThrow(FolderDepthExceededError);
  });

  describe('assertCanMoveTo', () => {
    it('CA-8: dentro de sí misma o de una descendiente es un movimiento inválido', () => {
      const [a, b] = chain();

      expect(() => a.assertCanMoveTo(a, a.depth, MAX_DEPTH)).toThrow(InvalidMoveError);
      expect(() => a.assertCanMoveTo(b, b.depth, MAX_DEPTH)).toThrow(InvalidMoveError);
    });

    it('CA-9: si el subárbol quedaría más hondo que el máximo, lo rechaza', () => {
      const [a, b] = chain();
      const nested = create({ id: D, parent: create({ id: OWNER }) });

      expect(() => b.assertCanMoveTo(nested, MAX_DEPTH, MAX_DEPTH)).toThrow(
        FolderDepthExceededError,
      );
      expect(() => a.assertCanMoveTo(null, MAX_DEPTH, MAX_DEPTH)).not.toThrow();
    });

    it('CA-7: a otra carpeta propia o a la raíz es válido', () => {
      const [, b] = chain();
      const other = create({ id: OWNER });

      expect(() => b.assertCanMoveTo(other, b.depth, MAX_DEPTH)).not.toThrow();
      expect(() => b.assertCanMoveTo(null, b.depth, MAX_DEPTH)).not.toThrow();
    });
  });

  it('`rehydrate` reconstruye el mismo estado, también en la papelera', () => {
    const trashed = Folder.rehydrate({
      ...create().snapshot(),
      trash: TrashState.start(NOW, 30),
    });

    expect(Folder.rehydrate(trashed.snapshot()).snapshot()).toEqual(trashed.snapshot());
    expect(trashed.trash?.isTrashRoot).toBe(true);
  });

  it('`rehydrate` exige que el padre coincida con la ruta', () => {
    const snapshot = { ...chain()[1].snapshot(), parentId: C };

    expect(() => Folder.rehydrate(snapshot)).toThrow(TypeError);
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(create())).toBe(true);
  });
});
