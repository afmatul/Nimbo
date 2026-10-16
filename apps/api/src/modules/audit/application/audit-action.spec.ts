import { AuditAction, isAuditAction } from './audit-action';

describe('AuditAction', () => {
  it('CA-20 (005), CA-24 (006), CA-19 (014): el catálogo `AuditAction` es carga, descarga, papelera y versiones', () => {
    expect(Object.values(AuditAction).sort()).toEqual(
      [
        'file.download_url_issued',
        'file.upload_completed',
        'file.upload_rejected',
        'file.version_restored',
        'file.version_pruned',
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
