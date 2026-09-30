import { FILE_KIND_CATALOG, FILE_KINDS, fileKindOf } from './file-kind';

describe('FILE_KIND_CATALOG', () => {
  it.each([
    ['docx', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pptx', 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['pdf', 'pdf', 'application/pdf'],
    ['txt', 'texto', 'text/plain'],
    ['md', 'texto', 'text/markdown'],
    ['png', 'imagen', 'image/png'],
    ['jpg', 'imagen', 'image/jpeg'],
    ['jpeg', 'imagen', 'image/jpeg'],
    ['gif', 'imagen', 'image/gif'],
    ['webp', 'imagen', 'image/webp'],
  ])('CA-12: «.%s» es %s (%s)', (extension, kind, mime) => {
    expect(fileKindOf(extension)).toEqual({ kind, mime });
  });

  it.each(['svg', 'bmp', 'heic', 'zip', 'exe', 'doc', ''])(
    'CA-12: «.%s» es `otro` (D-9)',
    (extension) => {
      expect(fileKindOf(extension)).toEqual({ kind: 'otro', mime: 'application/octet-stream' });
    },
  );

  it('CA-12: la búsqueda no distingue mayúsculas', () => {
    expect(fileKindOf('PDF').kind).toBe('pdf');
  });

  it('CA-12: cada tipo del catálogo pertenece a los tipos de `archivo.tipo`', () => {
    for (const entry of Object.values(FILE_KIND_CATALOG)) {
      expect(FILE_KINDS).toContain(entry.kind);
    }
    expect([...FILE_KINDS].sort()).toEqual(
      ['docx', 'imagen', 'otro', 'pdf', 'pptx', 'texto', 'xlsx'].sort(),
    );
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(FILE_KIND_CATALOG)).toBe(true);
  });
});
