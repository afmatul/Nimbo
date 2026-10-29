import { DocxLocation } from './docx-location';
import { PdfLocation } from './pdf-location';
import { SheetLocation } from './sheet-location';
import { SlideLocation } from './slide-location';
import type { SourceLocation } from './source-location';
import { sourceLocationFromJson } from './source-location-json';
import { TextLocation } from './text-location';

const range = (first: SourceLocation, last: SourceLocation): SourceLocation =>
  first.mergeWith(last);

describe('sourceLocationFromJson (plan 020 D-5, RN-6)', () => {
  it.each<[string, SourceLocation]>([
    ['pdf', PdfLocation.page(3)],
    ['docx de un párrafo', DocxLocation.paragraph(2, 4)],
    ['docx de un rango', range(DocxLocation.paragraph(1, 2), DocxLocation.paragraph(1, 5))],
    ['docx del inicio del documento', DocxLocation.paragraph(0, 1)],
    ['texto de un rango', range(TextLocation.line(10), TextLocation.line(24))],
    ['hoja', SheetLocation.sheet('Ventas 2026')],
    ['diapositiva', SlideLocation.slide(7)],
    ['pdf aproximado', PdfLocation.page(2, 0.5)],
  ])('RN-6: rehidrata %s con la misma ubicación y etiqueta que guardó 019', (_case, location) => {
    const restored = sourceLocationFromJson(location.toJson());

    expect(restored?.toJson()).toEqual(location.toJson());
    expect(restored?.label()).toBe(location.label());
  });

  it('CA-4: una ubicación incierta conserva su certeza y su etiqueta aproximada', () => {
    const restored = sourceLocationFromJson({ tipo: 'xlsx', hoja: 'Gastos', confianza: 0.4 });

    expect(restored?.isCertain()).toBe(false);
    expect(restored?.label()).toBe('Hoja «Gastos» (ubicación aproximada)');
  });

  it('RN-6: la diapositiva y la hoja salen con su etiqueta de cita', () => {
    expect(sourceLocationFromJson({ tipo: 'pptx', numero: 4, confianza: 1 })?.label()).toBe(
      'Diapositiva 4',
    );
    expect(sourceLocationFromJson({ tipo: 'xlsx', hoja: 'Resumen', confianza: 1 })?.label()).toBe(
      'Hoja «Resumen»',
    );
  });

  it.each<[string, unknown]>([
    ['nulo', null],
    ['un texto', 'pdf:3'],
    ['un arreglo', [{ tipo: 'pdf', pagina: 1, confianza: 1 }]],
    ['tipo desconocido', { tipo: 'odt', pagina: 1, confianza: 1 }],
    ['tipo heredado del prototipo', { tipo: 'toString', confianza: 1 }],
    ['sin confianza', { tipo: 'pdf', pagina: 1 }],
    ['confianza fuera de rango', { tipo: 'pdf', pagina: 1, confianza: 2 }],
    ['página como texto', { tipo: 'pdf', pagina: '1', confianza: 1 }],
    ['página cero', { tipo: 'pdf', pagina: 0, confianza: 1 }],
    ['página decimal', { tipo: 'pdf', pagina: 1.5, confianza: 1 }],
    ['docx sin párrafo final', { tipo: 'docx', seccion: 1, parrafoDesde: 2, confianza: 1 }],
    [
      'docx con rango invertido',
      { tipo: 'docx', seccion: 1, parrafoDesde: 5, parrafoHasta: 2, confianza: 1 },
    ],
    ['texto con rango invertido', { tipo: 'texto', lineaDesde: 9, lineaHasta: 3, confianza: 1 }],
    ['hoja sin nombre', { tipo: 'xlsx', hoja: '', confianza: 1 }],
    ['hoja numérica', { tipo: 'xlsx', hoja: 3, confianza: 1 }],
    ['diapositiva negativa', { tipo: 'pptx', numero: -1, confianza: 1 }],
  ])('D-5: una procedencia inválida (%s) no se rehidrata ni inventa ubicación', (_case, json) => {
    expect(sourceLocationFromJson(json)).toBeUndefined();
  });
});
