import { AuditAction, isAuditAction } from './audit-action';

describe('AuditAction', () => {
  it('CA-20 (005), CA-24 (006): el catálogo `AuditAction` es carga, descarga y papelera', () => {
    expect(Object.values(AuditAction).sort()).toEqual(
      [
        'file.download_url_issued',
        'file.upload_completed',
        'file.upload_rejected',
        'node.trashed',
        'node.restored',
        'node.purged',
        'trash.emptied',
      ].sort(),
    );
  });

  it('CA-3: `isAuditAction` acepta el catálogo y rechaza cualquier otra cadena o tipo', () => {
    expect(isAuditAction('file.upload_rejected')).toBe(true);
    expect(isAuditAction('file.deleted')).toBe(false);
    expect(isAuditAction(42)).toBe(false);
    expect(isAuditAction(undefined)).toBe(false);
  });
});
