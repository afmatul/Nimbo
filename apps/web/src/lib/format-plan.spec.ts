import { formatCount, formatDocxEditing, formatMaxEditors, formatPlanBytes } from './format-plan';

describe('format-plan (008 RN-1, CA-2)', () => {
  it.each([
    ['512', '512 B'],
    ['50000000', '50 MB'],
    ['1500000000', '1,5 GB'],
    ['15000000000', '15 GB'],
    ['100000000000', '100 GB'],
    ['2000000000000', '2 TB'],
  ])('PD-91: %s bytes se muestran como «%s» (base 1000, como `formatBytes`)', (bytes, expected) => {
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
