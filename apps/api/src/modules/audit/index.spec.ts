import * as audit from './index';

describe('API pública de `audit`', () => {
  it('CA-2: exporta `I_AUDIT_LOGGER`, `AuditAction`, `AuditModule` y `AuditHttpModule`; nunca `AuditService` ni el repositorio (DF-60)', () => {
    expect(Object.keys(audit).sort()).toEqual(
      ['AuditAction', 'AuditHttpModule', 'AuditModule', 'I_AUDIT_LOGGER'].sort(),
    );
  });
});
