import * as audit from './index';

describe('API pública de `audit`', () => {
  it('CA-20: exporta el token `I_AUDIT_LOGGER`, `AuditAction` y `AuditModule`, nunca `LogAuditLogger` (005 T-38)', () => {
    expect(Object.keys(audit).sort()).toEqual(
      ['AuditAction', 'AuditModule', 'I_AUDIT_LOGGER'].sort(),
    );
  });
});
