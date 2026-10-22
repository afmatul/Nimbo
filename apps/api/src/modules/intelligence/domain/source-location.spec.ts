import { DocxLocation } from './docx-location';
import { PdfLocation } from './pdf-location';
import { SheetLocation } from './sheet-location';
import { SlideLocation } from './slide-location';
import { TextLocation } from './text-location';

describe('SourceLocation (DF-07, DF-78)', () => {
  describe('groupKey', () => {
    it('RN-3: los párrafos de una misma sección comparten unidad; los de otra sección, no', () => {
      expect(DocxLocation.paragraph(2, 1).groupKey()).toBe(DocxLocation.paragraph(2, 7).groupKey());
      expect(DocxLocation.paragraph(2, 1).groupKey()).not.toBe(
        DocxLocation.paragraph(3, 1).groupKey(),
      );
    });

    it('RN-3: cada página, hoja y diapositiva es su propia unidad', () => {
      expect(PdfLocation.page(1).groupKey()).not.toBe(PdfLocation.page(2).groupKey());
      expect(SheetLocation.sheet('Ventas').groupKey()).not.toBe(
        SheetLocation.sheet('Gastos').groupKey(),
      );
      expect(SlideLocation.slide(1).groupKey()).not.toBe(SlideLocation.slide(2).groupKey());
    });

    it('CA-3: todas las líneas de un texto comparten unidad (el fragmento es un rango de líneas)', () => {
      expect(TextLocation.line(1).groupKey()).toBe(TextLocation.line(900).groupKey());
    });

    it('RN-3: ubicaciones de tipos distintos nunca comparten unidad', () => {
      const keys = [
        DocxLocation.paragraph(1, 1),
        PdfLocation.page(1),
        TextLocation.line(1),
        SheetLocation.sheet('1'),
        SlideLocation.slide(1),
      ].map((location) => location.groupKey());
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('mergeWith', () => {
    it('CA-1: une párrafos contiguos de una sección en un rango', () => {
      const merged = DocxLocation.paragraph(2, 3).mergeWith(DocxLocation.paragraph(2, 5));
      expect(merged.toJson()).toEqual({
        tipo: 'docx',
        seccion: 2,
        parrafoDesde: 3,
        parrafoHasta: 5,
        confianza: 1,
      });
    });

    it('CA-3: une líneas en un rango', () => {
      const merged = TextLocation.line(10).mergeWith(TextLocation.line(24));
      expect(merged.toJson()).toEqual({
        tipo: 'texto',
        lineaDesde: 10,
        lineaHasta: 24,
        confianza: 1,
      });
    });

    it('CA-2: dos trozos de la misma página siguen siendo esa página', () => {
      expect(PdfLocation.page(4).mergeWith(PdfLocation.page(4)).toJson()).toEqual(
        PdfLocation.page(4).toJson(),
      );
    });

    it('RN-3: rechaza unir ubicaciones distintas', () => {
      expect(() => PdfLocation.page(1).mergeWith(PdfLocation.page(2))).toThrow(RangeError);
      expect(() => DocxLocation.paragraph(1, 1).mergeWith(DocxLocation.paragraph(2, 1))).toThrow(
        RangeError,
      );
      expect(() => TextLocation.line(1).mergeWith(PdfLocation.page(1))).toThrow(RangeError);
    });

    it('RN-3: al unir, la confianza es la menor de ambas', () => {
      const merged = PdfLocation.page(1).mergeWith(PdfLocation.page(1, 0.5));
      expect(merged.isCertain()).toBe(false);
      expect(merged.confidence).toBe(0.5);
    });
  });

  describe('label', () => {
    it.each([
      ['Sección 2, párrafo 3', DocxLocation.paragraph(2, 3)],
      [
        'Sección 2, párrafos 3–5',
        DocxLocation.paragraph(2, 3).mergeWith(DocxLocation.paragraph(2, 5)),
      ],
      ['Inicio del documento, párrafo 1', DocxLocation.paragraph(0, 1)],
      ['Página 3', PdfLocation.page(3)],
      ['Línea 3', TextLocation.line(3)],
      ['Líneas 10–24', TextLocation.line(10).mergeWith(TextLocation.line(24))],
      ['Hoja «Ventas»', SheetLocation.sheet('Ventas')],
      ['Diapositiva 4', SlideLocation.slide(4)],
    ])('CA-1, CA-2, CA-3, CA-6: se cita como «%s»', (label, location) => {
      expect(location.label()).toBe(label);
    });

    it('RN-3: una ubicación incierta lo dice en la cita', () => {
      expect(PdfLocation.page(3, 0.4).label()).toBe('Página 3 (ubicación aproximada)');
    });
  });

  describe('isCertain y validación', () => {
    it('RN-3: por defecto la ubicación es exacta', () => {
      expect(PdfLocation.page(1).isCertain()).toBe(true);
    });

    it.each([
      () => PdfLocation.page(0),
      () => TextLocation.line(1.5),
      () => DocxLocation.paragraph(-1, 1),
      () => DocxLocation.paragraph(0, 0),
      () => SlideLocation.slide(0),
      () => PdfLocation.page(1, 1.2),
      () => PdfLocation.page(1, -0.1),
    ])('rechaza números de ubicación o confianza inválidos (%#)', (build) => {
      expect(build).toThrow(RangeError);
    });
  });

  describe('toJson (forma de DF-07)', () => {
    it.each([
      [PdfLocation.page(3), { tipo: 'pdf', pagina: 3, confianza: 1 }],
      [SheetLocation.sheet('Ventas'), { tipo: 'xlsx', hoja: 'Ventas', confianza: 1 }],
      [SlideLocation.slide(4), { tipo: 'pptx', numero: 4, confianza: 1 }],
      [
        DocxLocation.paragraph(0, 2),
        { tipo: 'docx', seccion: 0, parrafoDesde: 2, parrafoHasta: 2, confianza: 1 },
      ],
    ])('CA-1, CA-2, CA-6: forma %#', (location, json) => {
      expect(location.toJson()).toEqual(json);
    });
  });
});
