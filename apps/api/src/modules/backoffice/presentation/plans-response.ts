import type { PlanAdminListResponse, PlanAdminView } from '@nimbo/contracts';

import type { PlanCatalogEntry } from '../application/catalog-admin.service';

/** Lista blanca (011 CA-8): solo estos campos salen; bytes como texto decimal y la fecha en ISO (ADR-0016). */
export const toPlanAdminView = ({ plan, clientCount }: PlanCatalogEntry): PlanAdminView => ({
  id: plan.id,
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  priceCents: plan.priceCents,
  quotaBytes: plan.limits.quotaBytes.toString(),
  maxFileBytes: plan.limits.maxFileBytes.toString(),
  maxEditors: plan.limits.maxEditors,
  agentQueriesPerMonth: plan.limits.agentQueriesPerMonth,
  retainedVersions: plan.limits.retainedVersions,
  trashRetentionDays: plan.limits.trashRetentionDays,
  deactivatedAt: plan.deactivatedAt?.toISOString() ?? null,
  clientCount,
  isDefault: plan.isDefault,
});

/** `GET /backoffice/plans`: todos los planes, en el orden del catálogo. */
export const toPlanAdminListResponse = (
  entries: readonly PlanCatalogEntry[],
): PlanAdminListResponse => ({ items: entries.map(toPlanAdminView) });
