import { documentIdOf, documentRoom, userRoom } from './room-names';

const USER_ID = '5a3e1c7b-2d4f-4a6b-8c9d-0e1f2a3b4c5d';
const DOCUMENT_ID = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

describe('nombres de sala (RN-1)', () => {
  it('RN-1: la sala de un usuario y la de un documento no se confunden', () => {
    expect(userRoom(USER_ID)).toBe(`user:${USER_ID}`);
    expect(documentRoom(DOCUMENT_ID)).toBe(`doc:${DOCUMENT_ID}`);
  });

  it('RN-1: `documentIdOf` lee el id solo de una sala de documento', () => {
    expect(documentIdOf(documentRoom(DOCUMENT_ID))).toBe(DOCUMENT_ID);
    expect(documentIdOf(userRoom(USER_ID))).toBeNull();
    expect(documentIdOf('una-sala-cualquiera')).toBeNull();
  });
});
