import { editedVersionIdOf, uuidV5 } from './edited-version-id';

/** Espacio de nombres DNS de RFC 4122 (apéndice C) y su vector conocido para «www.example.com». */
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

describe('id de la versión editada (016 CA-10, DF-05)', () => {
  it('uuid v5 de RFC 4122: da el vector conocido', () => {
    expect(uuidV5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('CA-10: la misma sesión da siempre la misma versión, y es un uuid v5', () => {
    const id = editedVersionIdOf(SESSION_ID);

    expect(id).toMatch(UUID_V5);
    expect(editedVersionIdOf(SESSION_ID)).toBe(id);
    expect(id).not.toBe(SESSION_ID);
  });

  it('CA-10: sesiones distintas dan versiones distintas', () => {
    expect(editedVersionIdOf(SESSION_ID)).not.toBe(
      editedVersionIdOf('7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b'),
    );
  });
});
