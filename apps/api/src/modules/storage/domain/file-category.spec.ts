import { categoryOf, FILE_CATEGORIES } from './file-category';
import { FILE_KINDS, type FileKind } from './file-kind';

describe('categoryOf', () => {
  it.each<FileKind>(['docx', 'pdf', 'texto', 'xlsx', 'pptx'])(
    'CA-2: `%s` cuenta como Documentos',
    (kind) => {
      expect(categoryOf(kind)).toBe('documents');
    },
  );

  it('CA-2: `imagen` cuenta como Imágenes', () => {
    expect(categoryOf('imagen')).toBe('images');
  });

  it('CA-2: `otro` cuenta como Otros', () => {
    expect(categoryOf('otro')).toBe('other');
  });

  it('CA-2: todo tipo de archivo cae en una de las tres categorías', () => {
    for (const kind of FILE_KINDS) {
      expect(FILE_CATEGORIES).toContain(categoryOf(kind));
    }
  });
});
