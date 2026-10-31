import { AuditAction, isAuditAction } from './audit-action';

describe('AuditAction', () => {
  it('CA-20 (005), CA-24 (006), CA-19 (014), 011 §2, 016 §5, 010 CA-22, 019 D-6, 011b §4, 012 CA-19: carga, descarga, papelera, versiones, acciones internas, edición, suscripción, indexación y compartición', () => {
    expect(Object.values(AuditAction).sort()).toEqual(
      [
        'edit.save_failed',
        'edit.session_opened',
        'file.indexed',
        'file.index_unindexable',
        'file.index_failed',
        'file.index_retried',
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
        'account.quota_adjusted',
        'account.validity_adjusted',
        'client.files_viewed',
        'plan.created',
        'plan.deactivated',
        'subscription.auto_renew_changed',
        'subscription.renewed',
        'subscription.renewal_rejected',
        'subscription.read_only_entered',
        'subscription.read_only_exited',
        'subscription.plan_change_scheduled',
        'subscription.plan_change_cancelled',
        'subscription.plan_change_applied',
        'subscription.plan_change_discarded',
        'share.granted',
        'share.level_changed',
        'share.revoked',
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
