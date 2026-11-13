import type { Segment } from './segment';
import { thumbnailExcerptOf } from './thumbnail-excerpt';

const segments = (...texts: string[]): readonly Segment[] =>
  texts.map((text) => ({ text }) as unknown as Segment);

describe('thumbnailExcerptOf', () => {
  it('une los párrafos en orden, uno por línea, y colapsa los espacios', () => {
    expect(thumbnailExcerptOf(segments('Acta   de\treunión', '  Puntos  tratados '))).toBe(
      'Acta de reunión\nPuntos tratados',
    );
  });

  it('omite los párrafos en blanco y devuelve vacío si no hay texto', () => {
    expect(thumbnailExcerptOf(segments('  ', '\n'))).toBe('');
    expect(thumbnailExcerptOf([])).toBe('');
  });

  it('corta en el límite de una palabra con «…» sin pasar del máximo', () => {
    const excerpt = thumbnailExcerptOf(segments('uno dos tres cuatro cinco'), 14);
    expect(excerpt).toBe('uno dos tres…');
    expect(excerpt.length).toBeLessThanOrEqual(15);
  });

  it('un texto que cabe no se toca', () => {
    expect(thumbnailExcerptOf(segments('corto'), 400)).toBe('corto');
  });
});
