import { formatCount, formatDocxEditing, formatMaxEditors, formatPlanBytes } from './format-plan';

describe('format-plan (008 RN-1, CA-2)', () => {
  it.each([
    ['512', '512 B'],
    ['52428800', '50 MB'],
    ['1610612736', '1.5 GB'],
    ['16106127360', '15 GB'],
    ['2199023255552', '2 TB'],
  ])('RN-1: %s bytes se muestran como «%s» (potencias de 1024)', (bytes, expected) => {
    expect(formatPlanBytes(bytes)).toBe(expected);
  });

  it('CA-2: separa los miles con espacio de no separación', () => {
    expect(formatCount(10000)).toBe('10 000');
  });

  it('CA-2: sin editores el plan es de solo lectura y los editores simultáneos son «—»', () => {
    expect(formatDocxEditing(0)).toBe('Solo lectura');
    expect(formatMaxEditors(0)).toBe('—');
    expect(formatDocxEditing(3)).toBe('Sí');
    expect(formatMaxEditors(3)).toBe('3');
  });
});
