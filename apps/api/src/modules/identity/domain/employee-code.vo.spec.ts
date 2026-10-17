import { EmployeeCode } from './employee-code.vo';

describe('EmployeeCode (011 RN-5, Q-4)', () => {
  it('RN-5: recorta y pasa a mayúsculas', () => {
    expect(EmployeeCode.of('  sop-014 ').value).toBe('SOP-014');
  });

  it.each(['A', 'OPS-2026-0001-ABCDEF', '0123456789'])('RN-5: admite %p', (raw) => {
    expect(EmployeeCode.of(raw).value).toBe(raw);
  });

  it.each(['', '   ', 'SOP 014', 'SOP_014', 'ÑANDÚ-1', 'A'.repeat(21)])(
    'RN-5: rechaza %p',
    (raw) => {
      expect(() => EmployeeCode.of(raw)).toThrow(TypeError);
    },
  );

  it('RN-5: dos códigos iguales tras normalizar son el mismo', () => {
    expect(EmployeeCode.of('sop-014').equals(EmployeeCode.of('SOP-014'))).toBe(true);
  });
});
