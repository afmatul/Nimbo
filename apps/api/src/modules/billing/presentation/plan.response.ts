import type { Plan as PlanResponse } from '@nimbo/contracts';

import type { Plan } from '../domain/entities/plan.entity';

/**
 * Lista blanca del contrato de plan: precio entero (ADR-0016) y bytes como cadena decimal para no perder precisión
 * (008 CA-1). La usan el catálogo y «Plan y facturación» (009 CA-7).
 */
export const toPlanResponse = ({ limits, ...plan }: Plan): PlanResponse => ({
  id: plan.id,
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  priceCents: plan.priceCents,
  quotaBytes: limits.quotaBytes.toString(),
  maxFileBytes: limits.maxFileBytes.toString(),
  maxEditors: limits.maxEditors,
  agentQueriesPerMonth: limits.agentQueriesPerMonth,
  retainedVersions: limits.retainedVersions,
  trashRetentionDays: limits.trashRetentionDays,
});
