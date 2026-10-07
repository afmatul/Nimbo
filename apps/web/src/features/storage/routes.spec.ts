import { returnFocusOf, returnPathOf } from './routes';

const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const FOLDER_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

describe('retorno acotado de la vista previa (017 §6)', () => {
  it('CA-9: un archivo de la raíz vuelve a /archivos con su fila como objetivo de foco', () => {
    expect(returnPathOf({ id: FILE_ID, folderId: null })).toBe(`/archivos?foco=${FILE_ID}`);
  });

  it('CA-9: un archivo de una carpeta vuelve a esa carpeta con su fila como objetivo de foco', () => {
    expect(returnPathOf({ id: FILE_ID, folderId: FOLDER_ID })).toBe(
      `/archivos/carpeta/${FOLDER_ID}?foco=${FILE_ID}`,
    );
  });

  it('CA-9: lee el objetivo de foco de la búsqueda de la ruta', () => {
    expect(returnFocusOf({ foco: FILE_ID })).toBe(FILE_ID);
  });

  it('CA-7: sin objetivo, o con un valor repetido, no hay foco que restaurar', () => {
    expect(returnFocusOf({})).toBeNull();
    expect(returnFocusOf({ foco: [FILE_ID, FILE_ID] })).toBeNull();
    expect(returnFocusOf({ foco: '' })).toBeNull();
  });
});
