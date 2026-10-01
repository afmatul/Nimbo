import { TrashState } from '../../domain/trash-state';

import { toTrashState, trashColumns } from './trash-columns';

const FOLDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-09-30T10:00:00.000Z');

describe('columnas de papelera', () => {
  it('CA-10: un nodo vivo no tiene estado de papelera y se guarda con columnas nulas', () => {
    const live = { eliminadoEn: null, purgarEn: null, eliminadoConCarpetaId: null };

    expect(toTrashState(live)).toBeNull();
    expect(trashColumns(null)).toEqual(live);
  });

  it('CA-11, CA-19: ida y vuelta conserva fechas y la carpeta que lo arrastró', () => {
    const trash = TrashState.start(NOW, 30).carriedBy(FOLDER);

    expect(toTrashState(trashColumns(trash))?.snapshot()).toEqual(trash.snapshot());
  });

  it('una fila eliminada sin fecha de purga es un error de datos', () => {
    expect(() =>
      toTrashState({ eliminadoEn: NOW, purgarEn: null, eliminadoConCarpetaId: null }),
    ).toThrow(TypeError);
  });
});
