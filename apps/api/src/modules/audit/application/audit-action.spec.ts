import { AuditAction, isAuditAction } from './audit-action';

describe('AuditAction', () => {
  it('CA-20 (005), CA-24 (006), CA-19 (014), 011 §2, 016 §5: carga, descarga, papelera, versiones, acciones internas y edición', () => {
    expect(Object.values(AuditAction).sort()).toEqual(
      [
        'edit.save_failed',
        'edit.session_opened',
        'file.version_created',
        'file.download_url_issued',
        'file.upload_completed',
        'file.upload_rejected',
        'file.version_restored',
        'file.version_pruned',
        'node.trashed',
        'node.restored',
        'node.purged',
        'trash.emptied',
        'account.suspended',
        'account.reactivated',
        'account.internal_created',
        'account.bootstrap_admin',
        'client.files_viewed',
        'plan.created',
        'plan.deactivated',
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
