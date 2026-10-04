import { TrashState } from './trash-state';

const FOLDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DELETED_AT = new Date('2026-09-30T10:00:00.000Z');
const DAY_MS = 86_400_000;

describe('TrashState', () => {
  it.each([7, 30, 60, 90])(
    'CA-19: la purga queda fijada a %i días de la eliminación',
    (retentionDays) => {
      const state = TrashState.start(DELETED_AT, retentionDays);

      expect(state.deletedAt).toEqual(DELETED_AT);
      expect(state.purgeAt.getTime()).toBe(DELETED_AT.getTime() + retentionDays * DAY_MS);
      expect(state.trashedWithFolderId).toBeNull();
      expect(state.isTrashRoot).toBe(true);
    },
  );

  it.each([0, -1, 1.5])(
    'CA-19: rechaza una retención que no es un entero positivo (%s)',
    (days) => {
      expect(() => TrashState.start(DELETED_AT, days)).toThrow(TypeError);
    },
  );

  it('CA-11: lo arrastrado por una carpeta lleva su misma fecha y la marca de la carpeta', () => {
    const root = TrashState.start(DELETED_AT, 30);

    const carried = root.carriedBy(FOLDER);

    expect(carried.deletedAt).toEqual(root.deletedAt);
    expect(carried.purgeAt).toEqual(root.purgeAt);
    expect(carried.trashedWithFolderId).toBe(FOLDER);
    expect(carried.isTrashRoot).toBe(false);
  });

  it('CA-19: vence en la fecha de purga, no antes', () => {
    const state = TrashState.start(DELETED_AT, 7);
    const purgeAt = state.purgeAt.getTime();

    expect(state.isExpired(new Date(purgeAt - 1))).toBe(false);
    expect(state.isExpired(new Date(purgeAt))).toBe(true);
  });

  it('`rehydrate` exige purga posterior o igual a la eliminación', () => {
    expect(() =>
      TrashState.rehydrate({
        deletedAt: DELETED_AT,
        purgeAt: new Date(DELETED_AT.getTime() - 1),
        trashedWithFolderId: null,
      }),
    ).toThrow(TypeError);
  });

  it('es inmutable y no expone sus fechas internas', () => {
    const state = TrashState.start(DELETED_AT, 7);
    state.deletedAt.setTime(0);

    expect(Object.isFrozen(state)).toBe(true);
    expect(state.deletedAt).toEqual(DELETED_AT);
  });
});
