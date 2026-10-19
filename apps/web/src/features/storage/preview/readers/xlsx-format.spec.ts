import { cellFormatOf, formatIsoDate, formatPercent, formatSerial } from './xlsx-format';

function dateFormat(id: number) {
  const format = cellFormatOf(id, undefined);
  if (format.kind !== 'date') throw new Error(`El formato ${id} no es de fecha`);
  return format;
}

const DATE = dateFormat(14);
const DATE_TIME = dateFormat(22);

describe('formato mínimo XLSX: solo fechas, horas y porcentajes (D2)', () => {
  it.each([
    [0, undefined, { kind: 'general' }],
    [2, undefined, { kind: 'general' }],
    [9, undefined, { kind: 'percent', decimals: 0 }],
    [10, undefined, { kind: 'percent', decimals: 2 }],
    [14, undefined, { kind: 'date', date: true, time: false, seconds: false }],
    [17, undefined, { kind: 'date', date: true, time: false, seconds: false }],
    [20, undefined, { kind: 'date', date: false, time: true, seconds: false }],
    [21, undefined, { kind: 'date', date: false, time: true, seconds: true }],
    [22, undefined, { kind: 'date', date: true, time: true, seconds: false }],
    [46, undefined, { kind: 'date', date: false, time: true, seconds: true }],
    [164, 'dd/mm/yyyy', { kind: 'date', date: true, time: false, seconds: false }],
    [165, 'yyyy-mm-dd hh:mm:ss', { kind: 'date', date: true, time: true, seconds: true }],
    [166, '[$-409]mmm d, yyyy;@', { kind: 'date', date: true, time: false, seconds: false }],
    [167, '[h]:mm', { kind: 'date', date: false, time: true, seconds: false }],
    [168, '0.0%', { kind: 'percent', decimals: 1 }],
    [169, '#,##0.00 %;[Red]-#,##0.00 %', { kind: 'percent', decimals: 2 }],
    [170, '"día" 0', { kind: 'general' }],
    [171, '0.00E+00', { kind: 'general' }],
    [172, '[Red]#,##0', { kind: 'general' }],
    [173, '"100%" 0', { kind: 'general' }],
    [174, '@', { kind: 'general' }],
    [175, 'General', { kind: 'general' }],
  ])('formato %i %p se reconoce como %j', (id, code, expected) => {
    expect(cellFormatOf(id, code)).toEqual(expected);
  });

  it.each([
    [1, '01/01/1900'],
    [59, '28/02/1900'],
    [60, '29/02/1900'],
    [61, '01/03/1900'],
    [44927, '01/01/2023'],
    [46262, '28/08/2026'],
    [2958465, '31/12/9999'],
  ])('sistema 1900: serial %d es %s, incluido el 29/02/1900 histórico de Excel', (serial, text) => {
    expect(formatSerial(serial, DATE, false)).toBe(text);
  });

  it('sistema 1904: el mismo día tiene un serial 1462 menor', () => {
    expect(formatSerial(0, DATE, true)).toBe('01/01/1904');
    expect(formatSerial(46262 - 1462, DATE, true)).toBe('28/08/2026');
  });

  it('fecha y hora sin zona horaria local ni Intl', () => {
    expect(formatSerial(46262.75, DATE_TIME, false)).toBe('28/08/2026 18:00');
    expect(formatSerial(0.5, dateFormat(21), false)).toBe('12:00:00');
    expect(formatSerial(46262.999999, DATE_TIME, false)).toBe('29/08/2026 00:00');
  });

  it('último día de Excel: admite sus horas y nunca pasa al año 10000 (1900 y 1904)', () => {
    expect(formatSerial(2958465.5, DATE_TIME, false)).toBe('31/12/9999 12:00');
    expect(formatSerial(2958465.999999, DATE_TIME, false)).toBeUndefined();
    expect(formatSerial(2958465 - 1462, DATE, true)).toBe('31/12/9999');
    expect(formatSerial(2958465 - 1462 + 1, DATE, true)).toBeUndefined();
    expect(formatSerial(2958465 - 1462 + 0.999999, DATE_TIME, true)).toBeUndefined();
  });

  it.each([-1, 2958466, Number.NaN, Number.POSITIVE_INFINITY])(
    'serial fuera del calendario %p no se inventa como fecha',
    (serial) => {
      expect(formatSerial(serial, DATE, false)).toBeUndefined();
    },
  );

  it('porcentaje: valor × 100 con los decimales del formato y espacio como en el mockup', () => {
    expect(formatPercent(1, 0)).toBe('100 %');
    expect(formatPercent(0.35, 0)).toBe('35 %');
    expect(formatPercent(0.12345, 2)).toBe('12.35 %');
    expect(formatPercent(-0.5, 1)).toBe('-50.0 %');
  });

  it('fecha ISO de Strict (t="d") sin depender de la zona horaria', () => {
    expect(formatIsoDate('2026-08-28', DATE)).toBe('28/08/2026');
    expect(formatIsoDate('2026-08-28T18:30:00', DATE_TIME)).toBe('28/08/2026 18:30');
    expect(formatIsoDate('2026-08-28T18:30:15Z', cellFormatOf(0, undefined))).toBe(
      '28/08/2026 18:30:15',
    );
    // Sin formato de fecha: hora solo si no es medianoche y segundos solo si no son cero.
    expect(formatIsoDate('2026-08-28T18:30:00', cellFormatOf(0, undefined))).toBe(
      '28/08/2026 18:30',
    );
    expect(formatIsoDate('2026-08-28T00:00:00', cellFormatOf(0, undefined))).toBe('28/08/2026');
    expect(formatIsoDate('2026-02-30', DATE)).toBeUndefined();
    expect(formatIsoDate('28/08/2026', DATE)).toBeUndefined();
  });

  it.each(['2026-08-28T18:30:60', '2026-08-28T18:30:99'])(
    'CA-2: fecha ISO con segundos fuera de rango %s se rechaza sin normalizarla',
    (text) => {
      expect(formatIsoDate(text, DATE_TIME)).toBeUndefined();
    },
  );

  it.each([
    ['0099-08-28', '28/08/0099'],
    ['0096-02-29', '29/02/0096'],
  ])('CA-1: fecha ISO %s conserva el año literal sin sumar 1900', (text, expected) => {
    expect(formatIsoDate(text, DATE)).toBe(expected);
  });
});
