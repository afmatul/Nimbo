import { CHUNK_MAX_CHARS, CHUNK_TARGET_CHARS, Chunker, MAX_CHUNKS_PER_VERSION } from './chunker';
import { DocxLocation } from './docx-location';
import { NotIndexableError } from './errors';
import { PdfLocation } from './pdf-location';
import type { Segment } from './segment';
import { TextLocation } from './text-location';

const chunker = new Chunker();

const lines = (texts: readonly string[]): Segment[] =>
  texts.map((text, index) => ({ text, location: TextLocation.line(index + 1) }));

const pages = (count: number): Segment[] =>
  Array.from({ length: count }, (_, index) => ({
    text: `Página ${index + 1}`,
    location: PdfLocation.page(index + 1),
  }));

describe('Chunker (RN-3, D-3, D-4)', () => {
  it('usa los tamaños del plan: objetivo 1000 y máximo 1500 caracteres', () => {
    expect(CHUNK_TARGET_CHARS).toBe(1000);
    expect(CHUNK_MAX_CHARS).toBe(1500);
    expect(MAX_CHUNKS_PER_VERSION).toBe(5000);
  });

  it('CA-3: une líneas contiguas en un fragmento con su rango de líneas', () => {
    const chunks = chunker.split(lines(['uno', 'dos', 'tres']));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ order: 0, text: 'uno\ndos\ntres' });
    expect(chunks[0]?.location.label()).toBe('Líneas 1–3');
  });

  it('CA-2: nunca une texto de páginas distintas, aunque sea corto', () => {
    const chunks = chunker.split(pages(3));

    expect(chunks.map((chunk) => chunk.location.label())).toEqual([
      'Página 1',
      'Página 2',
      'Página 3',
    ]);
    expect(chunks.map((chunk) => chunk.order)).toEqual([0, 1, 2]);
  });

  it('CA-1, D-3: une párrafos de una sección y corta al cambiar de sección', () => {
    const chunks = chunker.split([
      { text: 'Antes', location: DocxLocation.paragraph(0, 1) },
      { text: 'Título', location: DocxLocation.paragraph(1, 1) },
      { text: 'Cuerpo', location: DocxLocation.paragraph(1, 2) },
    ]);

    expect(chunks.map((chunk) => [chunk.text, chunk.location.label()])).toEqual([
      ['Antes', 'Inicio del documento, párrafo 1'],
      ['Título\nCuerpo', 'Sección 1, párrafos 1–2'],
    ]);
  });

  it('CA-3: cierra el fragmento al alcanzar el objetivo, sin pasar del máximo', () => {
    const line = 'x'.repeat(99);
    const chunks = chunker.split(lines(Array.from({ length: 30 }, () => line)));

    expect(chunks.map((chunk) => chunk.location.label())).toEqual([
      'Líneas 1–11',
      'Líneas 12–22',
      'Líneas 23–30',
    ]);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('CA-3: no agrega una línea que haría pasar el máximo', () => {
    const chunks = chunker.split(lines(['a'.repeat(900), 'b'.repeat(700)]));

    expect(chunks.map((chunk) => chunk.location.label())).toEqual(['Línea 1', 'Línea 2']);
  });

  it('RN-3: parte un párrafo largo en trozos de la misma ubicación, cortando en un espacio', () => {
    const words = Array.from({ length: 700 }, (_, index) => `palabra${index}`).join(' ');
    const chunks = chunker.split([{ text: words, location: DocxLocation.paragraph(2, 4) }]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk.location.label()).toBe('Sección 2, párrafo 4');
      expect(chunk.text).toMatch(/^palabra\d+( palabra\d+)*$/);
    }
    expect(chunks.map((chunk) => chunk.text).join(' ')).toBe(words);
  });

  it('RN-3: parte un texto largo sin espacios por el objetivo, sin perder caracteres', () => {
    const text = 'z'.repeat(CHUNK_MAX_CHARS * 2);
    const chunks = chunker.split([{ text, location: PdfLocation.page(1) }]);

    expect(chunks.map((chunk) => chunk.text.length)).toEqual([1000, 1000, 1000]);
    expect(chunks.every((chunk) => chunk.location.label() === 'Página 1')).toBe(true);
  });

  it('no parte un par sustituto (emoji) al cortar sin espacios', () => {
    const text = `${'z'.repeat(CHUNK_TARGET_CHARS - 1)}😀${'z'.repeat(CHUNK_MAX_CHARS)}`;
    const chunks = chunker.split([{ text, location: PdfLocation.page(1) }]);

    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
    expect(chunks[0]?.text.endsWith('z')).toBe(true);
  });

  it('el resto de un párrafo largo se une con el párrafo siguiente de la misma sección', () => {
    const long = `${'a'.repeat(CHUNK_TARGET_CHARS)} ${'b'.repeat(600)}`;
    const chunks = chunker.split([
      { text: long, location: DocxLocation.paragraph(1, 1) },
      { text: 'corto', location: DocxLocation.paragraph(1, 2) },
    ]);

    expect(chunks.map((chunk) => chunk.location.label())).toEqual([
      'Sección 1, párrafo 1',
      'Sección 1, párrafos 1–2',
    ]);
  });

  it('ignora segmentos en blanco y no crea fragmentos vacíos', () => {
    expect(chunker.split(lines(['', '   ', '\t']))).toEqual([]);
  });

  it(`D-4: hasta ${MAX_CHUNKS_PER_VERSION} fragmentos por versión se aceptan`, () => {
    expect(chunker.split(pages(MAX_CHUNKS_PER_VERSION))).toHaveLength(MAX_CHUNKS_PER_VERSION);
  });

  it('CA-7, D-4: superar el tope de fragmentos es `demasiado_grande`', () => {
    const split = (): unknown => chunker.split(pages(MAX_CHUNKS_PER_VERSION + 1));

    expect(split).toThrow(NotIndexableError);
    expect(split).toThrow(expect.objectContaining({ reason: 'demasiado_grande' }));
  });
});
